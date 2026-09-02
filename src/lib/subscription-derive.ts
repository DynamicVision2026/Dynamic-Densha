/**
 * `subscription` is DERIVED (commerce spec §7.1) -- nothing writes state or
 * dates directly, not webhooks, not admins. This is the one function that
 * computes it, by folding the append-only billing_event + admin_action logs
 * forward. Pure: no DB, no clock reads, fully unit-testable. The server
 * wrapper (server/subscription.ts) reads the logs, calls this, and caches
 * the result back into the `subscription` row.
 *
 * Three transitions have NO event of their own and must be caught by
 * comparing `nowIso` against a date computed from past events, the same
 * way entitlement.ts catches trial expiry:
 *   - trial expiry (no external signal at all)
 *   - grace-period expiry after a failed charge (spec §6.3: 3 days)
 *   - a pending cancellation reaching its already-paid-through period end
 *     (spec §6.3/§9: "at period end, never immediately")
 * Every other transition is driven by a specific event and trusted as-is.
 */
import type { SubscriptionState } from "./entitlement.ts";

export type BillingEventType =
  | "subscription_created"
  | "subscription_charge_succeeded"
  | "subscription_charge_failed"
  | "subscription_cancelled"
  | "refund";

export type Plan = "monthly" | "yearly";

export type BillingEventInput = {
  type: BillingEventType;
  receivedAt: string;
  plan?: Plan;
};

export type AdminActionInput =
  | { type: "trial_extended"; days: number; createdAt: string }
  | { type: "note"; createdAt: string };

export type DerivedSubscription = {
  state: SubscriptionState;
  effectiveTrialEnd: string | null;
  paidUntil: string | null;
  plan: Plan | null;
};

export const GRACE_DAYS = 3;

function addDays(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * 24 * 60 * 60 * 1000).toISOString();
}

/** Calendar-correct: a monthly/yearly plan renews on the same day of the month/year, not +30/+365 raw days. */
function addPeriod(iso: string, plan: Plan | null): string {
  const d = new Date(iso);
  if (plan === "yearly") d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCMonth(d.getUTCMonth() + 1); // default to monthly cadence if plan is somehow unset
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
  let graceUntil: string | null = null;
  let cancelPending = false;

  for (const ev of input.events) {
    switch (ev.type) {
      case "subscription_created": {
        // spec §4.1: a subscription started during an active trial never
        // shortens it -- extend from whichever of (effective trial end, now)
        // is later, not from `now` alone.
        const base =
          effectiveTrialEnd && Date.parse(effectiveTrialEnd) > Date.parse(ev.receivedAt)
            ? effectiveTrialEnd
            : ev.receivedAt;
        plan = ev.plan ?? plan;
        paidUntil = addPeriod(base, plan);
        state = "active";
        graceUntil = null;
        cancelPending = false;
        break;
      }
      case "subscription_charge_succeeded": {
        plan = ev.plan ?? plan;
        const base = paidUntil && Date.parse(paidUntil) > Date.parse(ev.receivedAt) ? paidUntil : ev.receivedAt;
        paidUntil = addPeriod(base, plan);
        state = "active";
        graceUntil = null;
        cancelPending = false;
        break;
      }
      case "subscription_charge_failed": {
        // Stays active through grace (spec §6.3) -- a payment failure is a
        // payment problem, not a decision to stop.
        graceUntil = addDays(ev.receivedAt, GRACE_DAYS);
        state = "active";
        break;
      }
      case "subscription_cancelled": {
        // Stays active until paid_until; the actual state flip is the
        // time-driven check below, at period end, never immediately.
        cancelPending = true;
        break;
      }
      case "refund": {
        state = "lapsed";
        paidUntil = null;
        graceUntil = null;
        cancelPending = false;
        break;
      }
    }
  }

  if (state === "active" && graceUntil && Date.parse(input.nowIso) > Date.parse(graceUntil)) {
    state = "lapsed";
  } else if (state === "active" && cancelPending && paidUntil && Date.parse(input.nowIso) >= Date.parse(paidUntil)) {
    state = "cancelled";
  }

  return { state, effectiveTrialEnd, paidUntil, plan };
}
