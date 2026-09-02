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
};

/**
 * `now` matters only for `trial`: unlike active -> lapsed (always driven by
 * a Shopify webhook after the grace period), a trial's expiry has no
 * external signal at all -- nothing "tells" the app a trial ran out. The
 * cached `subscription.state` can therefore say 'trial' after the real
 * deadline has already passed, and this is the one place that must catch
 * that by comparing against the clock, not trust the cached label. Every
 * other transition (active/lapsed/cancelled) is written by a webhook or an
 * admin action and is trusted as-is.
 *
 * Shared by entitlement() and parentTrialBanner() below so this comparison
 * exists exactly once (the class of bug check-echo-eligibility-single-source
 * / check-single-entitlement.mjs exist to catch elsewhere in this project).
 */
function effectiveStateOf(sub: SubscriptionSnapshot, nowIso: string): SubscriptionState {
  const trialExpired =
    sub.state === "trial" &&
    sub.effectiveTrialEnd != null &&
    Date.parse(nowIso) > Date.parse(sub.effectiveTrialEnd);
  return trialExpired ? "lapsed" : sub.state;
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
