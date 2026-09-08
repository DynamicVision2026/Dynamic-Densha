/**
 * The one place that reads billing_event + admin_action and caches the
 * result into `subscription` (commerce spec §7.1). Every other file that
 * needs a household's entitlement calls getEntitlementForHousehold below —
 * never reads `subscription.state` and branches on it directly (that's
 * exactly what scripts/check-single-entitlement.mjs enforces).
 */
import {
  deriveSubscription,
  type AdminActionInput,
  type BillingEventInput,
} from "@/lib/subscription-derive";
import { entitlement, parentTrialBanner, type Entitlement, type ParentTrialBanner } from "@/lib/entitlement";
import { resolveHouseholdId, getOrCreateCheckoutToken } from "@/lib/server/household";

type Sql = {
  <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]>;
};

/** Recompute a household's subscription from its event logs and cache the result. Idempotent. */
export async function recomputeSubscription(
  sql: Sql,
  householdId: string,
  nowIso: string = new Date().toISOString(),
) {
  const base = await sql<{ trial_ends_at: string | null }>`
    select trial_ends_at from subscription where household_id = ${householdId}
  `;
  const baseTrialEndsAt = base[0]?.trial_ends_at ?? null;

  const eventRows = await sql<{ type: string; payload: unknown; received_at: string }>`
    select type, payload, received_at from billing_event
    where household_id = ${householdId}
    order by received_at asc
  `;
  const events: BillingEventInput[] = eventRows.map((r) => {
    const payload = (r.payload ?? {}) as {
      plan?: string;
      stripeCustomerId?: string;
      stripeSubscriptionId?: string;
    };
    return {
      type: r.type as BillingEventInput["type"],
      receivedAt: r.received_at,
      plan: payload.plan === "yearly" || payload.plan === "monthly" ? payload.plan : undefined,
      stripeCustomerId: typeof payload.stripeCustomerId === "string" ? payload.stripeCustomerId : undefined,
      stripeSubscriptionId:
        typeof payload.stripeSubscriptionId === "string" ? payload.stripeSubscriptionId : undefined,
    };
  });

  const adminRows = await sql<{ type: string; days: number | null; created_at: string }>`
    select type, days, created_at from admin_action
    where household_id = ${householdId}
    order by created_at asc
  `;
  const adminActions: AdminActionInput[] = adminRows.map((r) =>
    r.type === "trial_extended"
      ? { type: "trial_extended" as const, days: r.days ?? 0, createdAt: r.created_at }
      : { type: "note" as const, createdAt: r.created_at },
  );

  const derived = deriveSubscription({ baseTrialEndsAt, events, adminActions, nowIso });

  await sql`
    update subscription
    set state = ${derived.state},
        paid_until = ${derived.paidUntil},
        plan = ${derived.plan},
        stripe_customer_id = ${derived.stripeCustomerId},
        stripe_subscription_id = ${derived.stripeSubscriptionId},
        updated_at = now()
    where household_id = ${householdId}
  `;

  return derived;
}

/**
 * The Stripe webhook route's handler for every event AFTER checkout.session.
 * completed (invoice.payment_succeeded/failed, customer.subscription.
 * deleted/updated, charge.refunded) resolves a household this way --
 * looking up the ids checkout.session.completed already cached onto this
 * household's subscription row, never by email. Subscription id is checked
 * first (more specific than customer id, and what most of these events
 * carry); customer id is the fallback for event types that only carry that
 * (charge.refunded). Null if neither id is on file yet, e.g. an
 * invoice/subscription event that raced ahead of checkout.session.completed
 * -- the caller's job to decide whether that's retryable.
 */
export async function getHouseholdIdByStripeIds(
  sql: Sql,
  ids: { customerId?: string | null; subscriptionId?: string | null },
): Promise<string | null> {
  if (ids.subscriptionId) {
    const bySub = await sql<{ household_id: string }>`
      select household_id from subscription where stripe_subscription_id = ${ids.subscriptionId}
    `;
    if (bySub[0]) return bySub[0].household_id;
  }
  if (ids.customerId) {
    const byCustomer = await sql<{ household_id: string }>`
      select household_id from subscription where stripe_customer_id = ${ids.customerId}
    `;
    if (byCustomer[0]) return byCustomer[0].household_id;
  }
  return null;
}

/**
 * True once a household has an actual paid Stripe subscription (not
 * trialing, not lapsed/cancelled) -- distinct from entitlement()'s
 * canRide/canView, which deliberately don't distinguish trial from active
 * (both ride). The /subscribe resolver (src/routes/subscribe.ts) needs
 * exactly this distinction to avoid sending an already-paying household
 * back to Stripe to be charged twice, and the parent dashboard's checkout-
 * pending poll (src/routes/app/parent.tsx) needs it to know when a webhook
 * has actually landed. Both call this instead of comparing `state`
 * themselves -- see scripts/check-single-entitlement.mjs, which forbids a
 * literal `state === 'active'` anywhere outside this file.
 */
export async function isHouseholdActive(
  sql: Sql,
  householdId: string,
  nowIso: string = new Date().toISOString(),
): Promise<boolean> {
  const derived = await recomputeSubscription(sql, householdId, nowIso);
  return derived.state === "active";
}

/**
 * The one call site pattern: every surface that needs to know whether a
 * household can ride or view calls this, never reads `subscription.state`
 * itself.
 */
export async function getEntitlementForHousehold(
  sql: Sql,
  householdId: string,
  nowIso: string = new Date().toISOString(),
): Promise<Entitlement> {
  const derived = await recomputeSubscription(sql, householdId, nowIso);
  return entitlement({ state: derived.state, effectiveTrialEnd: derived.effectiveTrialEnd }, nowIso);
}

/**
 * Parent-dashboard-only companion to getEntitlementForHousehold — see
 * parentTrialBanner's own comment. Also carries the household's opaque
 * checkout_token (lazily created if this household predates it) so the
 * banner's subscribe CTA can build a Stripe Payment Link with
 * ?client_reference_id=<token> appended, never a bare URL and never the raw
 * household_id.
 */
export async function getParentTrialBanner(
  sql: Sql,
  householdId: string,
  nowIso: string = new Date().toISOString(),
): Promise<ParentTrialBanner & { checkoutToken: string }> {
  const derived = await recomputeSubscription(sql, householdId, nowIso);
  const banner = parentTrialBanner({ state: derived.state, effectiveTrialEnd: derived.effectiveTrialEnd }, nowIso);
  const checkoutToken = await getOrCreateCheckoutToken(sql, householdId);
  return { ...banner, checkoutToken };
}

/**
 * Riding itself is what's gated, not just the write at the end of one
 * (spec §3.1/§13 rule 4) -- a lapsed/cancelled household can view its train
 * (canView is never false) but must not be able to open a session at all:
 * not the study payload, not encounter/understand, not the graded answer.
 * Every server function reachable once a ride starts calls this first, so
 * there's one throw site and one error string, not four copies of the same
 * three lines.
 */
export async function assertCanRide(
  sql: Sql,
  userId: string,
  nowIso: string = new Date().toISOString(),
): Promise<void> {
  const householdId = await resolveHouseholdId(sql, userId, nowIso);
  const gate = await getEntitlementForHousehold(sql, householdId, nowIso);
  if (!gate.canRide) throw new Error("この列車は いま のれません");
}
