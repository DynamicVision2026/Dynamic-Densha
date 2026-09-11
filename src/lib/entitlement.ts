/**
 * Riding and viewing are separate entitlements (commerce spec §3.1) — a
 * lapsed household views but does not ride. One function, one call site per
 * surface: no component computes entitlement from `state` directly, and no
 * `state === 'lapsed'` (or 'active'/'trial') comparison exists outside this
 * file. See scripts/check-single-entitlement.mjs, the CI gate that enforces
 * that second sentence mechanically.
 *
 * `canView` is never false in any state — no state removes a family's sight
 * of their train (spec §3.1 rule 6, §13 rule 6).
 */

export type SubscriptionState = "guest" | "trial" | "active" | "lapsed" | "cancelled";

export type Entitlement = {
  canRide: boolean;
  canView: boolean;
};

/**
 * The fields entitlement() actually needs from a `subscription` row (plus
 * any admin_action extensions already folded into effectiveTrialEnd — see
 * server/subscription.ts's derivation). Deliberately not the full DB row
 * type, so this file stays importable from client components with no
 * server/DB import chain behind it.
 */
export type SubscriptionSnapshot = {
  state: SubscriptionState;
  /** trial_ends_at + admin_action trial_extended days (spec §7.1). Null once not trialing. */
  effectiveTrialEnd: string | null;
  /**
   * subscription.paid_until. NULL = permanent (a buyout), never backfilled --
   * see subscription-derive.ts. Only meaningful while `state === "active"`;
   * ignored otherwise.
   */
  paidUntil: string | null;
};

/**
 * `now` matters for two transitions, neither of which has an external signal
 * of its own:
 *   - trial expiry -- nothing "tells" the app a trial ran out.
 *   - an annual pass's paid_until passing -- Shopify sends no renewal
 *     webhook for a one-time, non-recurring purchase the way Stripe's
 *     recurring billing would have; a buyout's paid_until is permanently
 *     null and never trips this (spec: canRide = active && (paid_until ===
 *     null || now < paid_until)).
 * The cached `subscription.state` can therefore still say 'trial' or
 * 'active' after the real deadline has already passed, and this is the one
 * place that must catch that by comparing against the clock, not trust the
 * cached label. Every other transition (active/lapsed/cancelled) is written
 * by a webhook or an admin action and is trusted as-is.
 *
 * Shared by entitlement() and parentTrialBanner() below so this comparison
 * exists exactly once (the class of bug check-echo-eligibility-single-source
 * / check-single-entitlement.mjs exist to catch elsewhere in this project).
 * Exported so server/subscription.ts's isHouseholdActive() and
 * getParentTrialBanner() can use the SAME corrected state too -- both used
 * to compare the raw cached `derived.state` directly, which for an annual
 * pass whose paid_until already passed (no renewal webhook will ever tell
 * this app that) stayed "active" forever until some OTHER event happened to
 * trigger a recompute. That let an already-lapsed household hit /subscribe's
 * "already active" branch and get silently blocked from ever repurchasing.
 */
export function effectiveStateOf(sub: SubscriptionSnapshot, nowIso: string): SubscriptionState {
  const trialExpired =
    sub.state === "trial" &&
    sub.effectiveTrialEnd != null &&
    Date.parse(nowIso) > Date.parse(sub.effectiveTrialEnd);
  const annualExpired =
    sub.state === "active" &&
    sub.paidUntil != null &&
    Date.parse(nowIso) >= Date.parse(sub.paidUntil);
  return trialExpired || annualExpired ? "lapsed" : sub.state;
}

export function entitlement(sub: SubscriptionSnapshot, nowIso: string): Entitlement {
  switch (effectiveStateOf(sub, nowIso)) {
    case "guest":
    case "trial":
    case "active":
      return { canRide: true, canView: true };
    case "lapsed":
    case "cancelled":
      return { canRide: false, canView: true };
  }
}

/**
 * A household's coverage, as far as entitlement is concerned. Separate from
 * SubscriptionSnapshot because it comes from the `household` row, not the
 * derived `subscription` one -- and because keeping it separate makes the
 * rule below readable: the subscription answers "is this household paid
 * up", coverage answers "and does that reach this particular child".
 */
export type CoverageSnapshot = {
  /**
   * household.covered_child_id. NULL means every child is covered -- which
   * is the state of a trial, a buyout, and an annual pass that has not been
   * assigned yet. Those three are NOT equivalent, and the difference is not
   * visible here: an unassigned annual household reaches this with
   * `state: 'active'` and a null covered_child_id, which reads as "everyone
   * rides". src/lib/server/pass.ts is what keeps that from happening -- an
   * annual household with no assignment is reported as unassigned and the
   * parent surface blocks until they choose. See its own comment.
   */
  coveredChildId: string | null;
};

/**
 * Per-child entitlement.
 *
 * base    = the household is paid up (the existing household-level answer)
 * canRide = base AND the coverage reaches this child
 * canView = true, always, in every state, for every child
 *
 * `childId: null` asks the household-level question -- what the parent
 * dashboard wants ("can anyone in this household ride") rather than "can
 * this specific child". A null childId never matches a set coveredChildId,
 * which is the right answer: on an assigned annual pass, the household as a
 * whole is not freely rideable.
 *
 * The child surface must not be able to tell WHY canRide is false. A
 * sibling who does not hold the annual pass and a household whose trial ran
 * out get the identical `{ canRide: false, canView: true }` -- same board,
 * same disabled boarding pass, same 「いまは のれません」. That is not a
 * simplification: a child learning "my brother has the pass and I do not"
 * from a screen is the thing this shape exists to prevent. The parent
 * surface, which has the plan and the assignment, is where that is
 * explained.
 */
export function entitlementFor(
  sub: SubscriptionSnapshot,
  coverage: CoverageSnapshot,
  childId: string | null,
  nowIso: string,
): Entitlement {
  const base = entitlement(sub, nowIso);
  const covered = coverage.coveredChildId === null || coverage.coveredChildId === childId;
  return { canRide: base.canRide && covered, canView: base.canView };
}

/**
 * How many children a household may have, by tier.
 *
 * A trial is capped at three. Not to upsell -- three is already more than
 * the overwhelming majority of households need -- but because an
 * unauthenticated-in-practice free tier with no cap is a free bulk account,
 * and the cap has to live somewhere that a client cannot move.
 *
 * A PAID household is not capped on creation, annual included. This is the
 * distinction the whole multi-child model turns on: an annual pass limits
 * who may RIDE, not how many children may EXIST. A family with an annual
 * pass and two children is a completely normal state -- the second child is
 * created, keeps a profile and a train, and simply isn't covered. Capping
 * creation instead would mean a parent cannot even set up the sibling they
 * are about to move the pass to.
 *
 * A lapsed or cancelled household creates nothing. It keeps everything it
 * has (canView is never false) but does not grow while unpaid.
 *
 * Here in entitlement.ts, and not in a module of its own, because deciding
 * this means branching on subscription state -- which happens in exactly one
 * file in this codebase (see this file's header and
 * scripts/check-single-entitlement.mjs).
 */
export const TRIAL_CHILD_LIMIT = 3;

/** Infinity, not a large number: "no cap" must not read as "a cap I haven't hit yet". */
export type ChildQuota = { canCreate: boolean; limit: number };

export function childQuota(sub: SubscriptionSnapshot, nowIso: string): ChildQuota {
  switch (effectiveStateOf(sub, nowIso)) {
    case "guest":
    case "trial":
      return { canCreate: true, limit: TRIAL_CHILD_LIMIT };
    case "active":
      return { canCreate: true, limit: Infinity };
    case "lapsed":
    case "cancelled":
      return { canCreate: false, limit: 0 };
  }
}

/**
 * Parent-dashboard-only display info. Never used for gating (canRide/
 * canView don't need to know "why") and never rendered on the child
 * surface -- no price, no lock icon, no upgrade prompt there, entitled or
 * not (see departure-ticket.tsx).
 *
 * "trialEnded" covers both a trial that ran its normal ten days and one
 * backdated to `now` at household creation because this email already
 * spent a trial (spec §2.2, src/lib/server/household.ts) -- the two are
 * indistinguishable in `subscription` once expired, and the copy doesn't
 * need to tell them apart: either way, this email's free trial is over.
 * Shown from a household's very first visit onward when trialing, not just
 * near the end, so a parent who checks in occasionally already knows the
 * date before it arrives.
 */
export type ParentTrialBanner =
  | { kind: "trialing"; trialEndsAt: string }
  | { kind: "trialEnded" }
  | { kind: "cancelled" }
  | { kind: "none" };

export function parentTrialBanner(sub: SubscriptionSnapshot, nowIso: string): ParentTrialBanner {
  switch (effectiveStateOf(sub, nowIso)) {
    case "trial":
      return sub.effectiveTrialEnd
        ? { kind: "trialing", trialEndsAt: sub.effectiveTrialEnd }
        : { kind: "none" };
    case "lapsed":
      return { kind: "trialEnded" };
    case "cancelled":
      return { kind: "cancelled" };
    case "guest":
    case "active":
      return { kind: "none" };
  }
}
