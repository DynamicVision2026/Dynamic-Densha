/**
 * `subscription` is DERIVED (commerce spec §7.1) -- nothing writes state or
 * dates directly, not webhooks, not admins. This is the one function that
 * computes it, by folding the append-only billing_event + admin_action logs
 * forward. Pure: no DB, no clock reads, fully unit-testable. The server
 * wrapper (server/subscription.ts) reads the logs, calls this, and caches
 * the result back into the `subscription` row.
 *
 * Shopify Checkout sells one-time purchases (a permanent "buyout" or a
 * non-recurring "annual" pass), not a recurring subscription -- there is no
 * renewal webhook, no failed-charge grace period, and no "cancel at period
 * end" pending-cancellation state the way Stripe's model had. Two
 * transitions still have no event of their own and must be caught by
 * comparing `nowIso` against a date computed from past events, the same way
 * entitlement.ts catches expiry:
 *   - trial expiry (no external signal at all)
 *   - an annual pass reaching its own paid_until with no renewal order
 *     (nothing ever tells this app "the year is up" -- see entitlement.ts's
 *     own paid_until check, spec's canRide formula)
 * A buyout's paid_until is permanently null, so it never expires this way.
 * Every other transition (order_paid, refund, order_cancelled) is driven by
 * a specific event and trusted as-is.
 */
import type { SubscriptionState } from "./entitlement.ts";

export type BillingEventType = "order_paid" | "refund" | "order_cancelled";

export type Plan = "buyout" | "annual";

export type BillingEventInput = {
  type: BillingEventType;
  receivedAt: string;
  /**
   * Present on order_paid when src/lib/shopify-plan.ts resolved the order's
   * variant id to a known plan. Absent when the variant id matched neither
   * configured env var (an unrecognized/misconfigured price) -- the fold
   * below still grants entitlement in that case (a real payment happened;
   * see its own comment), it just can't compute a period end, so it treats
   * the purchase as permanent rather than risk wrongly cutting a paying
   * family off. Never present on refund/order_cancelled.
   */
  plan?: Plan;
  /**
   * Only ever present on order_paid -- every other event type resolves its
   * household via kd_token (or, for refunds/create, the order_id fallback --
   * see getHouseholdIdByShopifyOrderId) at the webhook route layer, before
   * this fold ever runs, so there's nothing to carry forward here.
   */
  shopifyCustomerId?: string;
  shopifyOrderId?: string;
};

export type AdminActionInput =
  | { type: "trial_extended"; days: number; createdAt: string }
  | { type: "note"; createdAt: string };

export type DerivedSubscription = {
  state: SubscriptionState;
  effectiveTrialEnd: string | null;
  paidUntil: string | null;
  plan: Plan | null;
  shopifyCustomerId: string | null;
  shopifyOrderId: string | null;
};

function addDays(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * 24 * 60 * 60 * 1000).toISOString();
}

/** Calendar-correct: an annual pass renews on the same calendar day a year later, not +365 raw days. */
function addYear(iso: string): string {
  const d = new Date(iso);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString();
}

export function deriveSubscription(input: {
  /** trial_ends_at, written once at household creation (spec §4/§7.1). Null for a household with no trial row at all. */
  baseTrialEndsAt: string | null;
  /** Ascending by receivedAt. */
  events: BillingEventInput[];
  adminActions: AdminActionInput[];
  nowIso: string;
}): DerivedSubscription {
  const extensionDays = input.adminActions
    .filter((a): a is Extract<AdminActionInput, { type: "trial_extended" }> => a.type === "trial_extended")
    .reduce((sum, a) => sum + a.days, 0);
  const effectiveTrialEnd = input.baseTrialEndsAt ? addDays(input.baseTrialEndsAt, extensionDays) : null;

  let state: SubscriptionState = effectiveTrialEnd ? "trial" : "guest";
  let paidUntil: string | null = null;
  let plan: Plan | null = null;
  let shopifyCustomerId: string | null = null;
  let shopifyOrderId: string | null = null;

  for (const ev of input.events) {
    switch (ev.type) {
      case "order_paid": {
        plan = ev.plan ?? plan;
        shopifyCustomerId = ev.shopifyCustomerId ?? shopifyCustomerId;
        shopifyOrderId = ev.shopifyOrderId ?? shopifyOrderId;
        state = "active";
        if (ev.plan === "buyout" || ev.plan === undefined) {
          // Permanent -- both a real buyout, and the safe default when the
          // variant id didn't resolve to a known plan at all: a real payment
          // was made, so this must never read as "not entitled" just because
          // a price/env-var lookup failed. The flagged, plan-unset
          // billing_event (see src/routes/api/webhooks/shopify.ts) is what a
          // human reconciles later; entitlement itself is never held hostage
          // to that reconciliation.
          paidUntil = null;
        } else {
          // spec §4.1 (unchanged from the Stripe-era logic): an annual
          // purchase made during an active trial never shortens it -- extend
          // from whichever of (effective trial end, this order's time) is
          // later, not from the order time alone.
          const base =
            effectiveTrialEnd && Date.parse(effectiveTrialEnd) > Date.parse(ev.receivedAt)
              ? effectiveTrialEnd
              : ev.receivedAt;
          paidUntil = addYear(base);
        }
        break;
      }
      case "refund":
      case "order_cancelled": {
        state = "lapsed";
        paidUntil = null;
        break;
      }
    }
  }

  return { state, effectiveTrialEnd, paidUntil, plan, shopifyCustomerId, shopifyOrderId };
}
