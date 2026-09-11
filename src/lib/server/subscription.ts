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
  type Plan,
} from "@/lib/subscription-derive";
import {
  entitlement,
  parentTrialBanner,
  effectiveStateOf,
  type Entitlement,
  type ParentTrialBanner,
} from "@/lib/entitlement";
import { getOrCreateCheckoutToken } from "@/lib/server/household";

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
      shopifyCustomerId?: string;
      shopifyOrderId?: string;
    };
    return {
      type: r.type as BillingEventInput["type"],
      receivedAt: r.received_at,
      plan: payload.plan === "buyout" || payload.plan === "annual" ? payload.plan : undefined,
      shopifyCustomerId: typeof payload.shopifyCustomerId === "string" ? payload.shopifyCustomerId : undefined,
      shopifyOrderId: typeof payload.shopifyOrderId === "string" ? payload.shopifyOrderId : undefined,
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
        shopify_customer_id = ${derived.shopifyCustomerId},
        shopify_order_id = ${derived.shopifyOrderId},
        updated_at = now()
    where household_id = ${householdId}
  `;

  // Upgrading to a buyout CLEARS the annual pass's child assignment rather
  // than reassigning it: a buyout covers every child, so a set
  // covered_child_id would mean the opposite of what the family just paid
  // for -- it would lock the household they just widened down to one child.
  //
  // Here, in the derivation, rather than in the webhook handler, for the
  // same reason everything else about a household's state is derived: the
  // webhook is one delivery of one event, and a household whose buyout
  // arrived while this column was already set must end up cleared on the
  // next read regardless of whether that particular delivery ran this code.
  //
  // covered_assigned_at is deliberately left alone. It gates annual
  // reassignment only, there is no downgrade path back to annual, and
  // keeping it preserves "when was the pass last moved" for support.
  if (derived.plan === "buyout") {
    await sql`
      update household set covered_child_id = null
      where id = ${householdId} and covered_child_id is not null
    `;
  }

  return derived;
}

/**
 * The Shopify webhook route's refunds/create handler resolves a household
 * this way. Unlike orders/paid and orders/cancelled (whose payload IS the
 * Order resource, carrying note_attributes.kd_token directly -- see
 * src/routes/api/webhooks/shopify.ts), a Refund webhook payload has no
 * note_attributes of its own, only `order_id` -- so this looks up the
 * household by the shopify_order_id an earlier orders/paid event already
 * cached onto its subscription row. Null if no order has been linked yet
 * (a refund arriving before its own orders/paid delivery landed, or a
 * refund for an order this household never actually made) -- the caller's
 * job to decide whether that's retryable.
 */
export async function getHouseholdIdByShopifyOrderId(
  sql: Sql,
  orderId: string | null | undefined,
): Promise<string | null> {
  if (!orderId) return null;
  const rows = await sql<{ household_id: string }>`
    select household_id from subscription where shopify_order_id = ${orderId}
  `;
  return rows[0]?.household_id ?? null;
}

/**
 * True once a household has an actual paid, still-in-effect Shopify order
 * (not trialing, not lapsed) -- distinct from entitlement()'s canRide/
 * canView, which deliberately don't distinguish trial from active (both
 * ride). The /subscribe and /handoff resolvers need exactly this
 * distinction to avoid sending an already-entitled household to Shopify to
 * pay twice, and the parent dashboard's checkout-pending poll (src/routes/
 * app/parent.tsx) needs it to know when a webhook has actually landed. Both
 * call this instead of comparing `state` themselves -- see
 * scripts/check-single-entitlement.mjs, which forbids a literal
 * `state === 'active'` anywhere outside this file.
 */
export async function isHouseholdActive(
  sql: Sql,
  householdId: string,
  nowIso: string = new Date().toISOString(),
): Promise<boolean> {
  const derived = await recomputeSubscription(sql, householdId, nowIso);
  // effectiveStateOf, not the raw derived.state -- an annual pass's own
  // fold never flips state back to 'lapsed' on its own (there's no renewal
  // webhook to drive that transition), so a stale raw 'active' would
  // wrongly bounce a household whose pass already expired to /subscribe's
  // "already active" branch, blocking them from ever repurchasing.
  return (
    effectiveStateOf(
      { state: derived.state, effectiveTrialEnd: derived.effectiveTrialEnd, paidUntil: derived.paidUntil },
      nowIso,
    ) === "active"
  );
}

/**
 * What /subscribe/success polls while it waits for the Shopify webhook.
 * Read-only in the sense that matters: it never grants anything. Entitlement
 * is granted by src/routes/api/webhooks/shopify.ts and nowhere else -- a
 * return URL is a browser's claim, forgeable by anyone who reads it once,
 * so this route observes the derived state and reports it, exactly like
 * every other surface.
 *
 * One recompute serves both answers, rather than isHouseholdActive() and a
 * separate recompute for plan/paidUntil -- at a 2s poll interval that
 * halves the query load for the whole confirmation window. Same
 * effectiveStateOf correction as isHouseholdActive itself (an annual pass
 * past its own paid_until has no renewal webhook to flip it).
 */
export async function getPassStateForHousehold(
  sql: Sql,
  householdId: string,
  nowIso: string = new Date().toISOString(),
): Promise<{ active: boolean; plan: Plan | null; paidUntil: string | null }> {
  const derived = await recomputeSubscription(sql, householdId, nowIso);
  const active =
    effectiveStateOf(
      { state: derived.state, effectiveTrialEnd: derived.effectiveTrialEnd, paidUntil: derived.paidUntil },
      nowIso,
    ) === "active";
  return { active, plan: derived.plan, paidUntil: derived.paidUntil };
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
  return entitlement(
    { state: derived.state, effectiveTrialEnd: derived.effectiveTrialEnd, paidUntil: derived.paidUntil },
    nowIso,
  );
}

/**
 * Parent-dashboard-only companion to getEntitlementForHousehold — see
 * parentTrialBanner's own comment. Also carries:
 *   - checkoutToken: the household's opaque checkout_token (lazily created
 *     if this household predates it), never used directly by the banner
 *     anymore (that lived in trial-banner.tsx's old inline subscribe
 *     buttons; the buy affordance is now <PlanCards>, a plain
 *     /subscribe?plan=... link that resolves its own token server-side) --
 *     kept here for any future caller that needs it without a second query.
 *   - isActive: whether the household is a currently-valid paying household
 *     right now (effectiveStateOf-corrected, see isHouseholdActive's own
 *     comment on why raw derived.state isn't enough) -- what ParentPage
 *     uses to decide between showing <PlanCards> (not active) or the
 *     current-plan notice (active).
 *   - plan / paidUntil: only meaningful when isActive is true; parent-
 *     dashboard-only display info for that current-plan notice, same as
 *     ParentTrialBanner itself never rendered on the child surface.
 */
export async function getParentTrialBanner(
  sql: Sql,
  householdId: string,
  nowIso: string = new Date().toISOString(),
): Promise<ParentTrialBanner & { checkoutToken: string; isActive: boolean; plan: Plan | null; paidUntil: string | null }> {
  const derived = await recomputeSubscription(sql, householdId, nowIso);
  const snapshot = { state: derived.state, effectiveTrialEnd: derived.effectiveTrialEnd, paidUntil: derived.paidUntil };
  const banner = parentTrialBanner(snapshot, nowIso);
  const checkoutToken = await getOrCreateCheckoutToken(sql, householdId);
  const isActive = effectiveStateOf(snapshot, nowIso) === "active";
  return { ...banner, checkoutToken, isActive, plan: derived.plan, paidUntil: derived.paidUntil };
}

/**
 * There used to be an `assertCanRide(sql, userId)` here: one household-level
 * gate that every ride-path server function called. It is gone, replaced by
 * assertChildCanRide in src/lib/server/coverage.ts, because it answered the
 * wrong question once a pass could cover one child instead of all of them --
 * an annual household is entitled, so this returned true for EVERY child in
 * it, including the siblings the pass does not cover. It also never checked
 * that the childId in the request belonged to the caller at all.
 *
 * Deleted rather than left deprecated: a correctly-named function that
 * silently under-checks is the kind of thing a future handler reaches for.
 */
