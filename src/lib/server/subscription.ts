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
  return entitlement(
    { state: derived.state, effectiveTrialEnd: derived.effectiveTrialEnd, paidUntil: derived.paidUntil },
    nowIso,
  );
}

/**
 * Parent-dashboard-only companion to getEntitlementForHousehold — see
 * parentTrialBanner's own comment. Also carries the household's opaque
 * checkout_token (lazily created if this household predates it) so the
 * banner's subscribe CTA can route to /subscribe?plan=..., never a bare URL
 * and never the raw household_id.
 */
export async function getParentTrialBanner(
  sql: Sql,
  householdId: string,
  nowIso: string = new Date().toISOString(),
): Promise<ParentTrialBanner & { checkoutToken: string }> {
  const derived = await recomputeSubscription(sql, householdId, nowIso);
  const banner = parentTrialBanner(
    { state: derived.state, effectiveTrialEnd: derived.effectiveTrialEnd, paidUntil: derived.paidUntil },
    nowIso,
  );
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
