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
 */
export function entitlement(sub: SubscriptionSnapshot, nowIso: string): Entitlement {
  const trialExpired =
    sub.state === "trial" &&
    sub.effectiveTrialEnd != null &&
    Date.parse(nowIso) > Date.parse(sub.effectiveTrialEnd);

  const effectiveState: SubscriptionState = trialExpired ? "lapsed" : sub.state;

  switch (effectiveState) {
    case "guest":
    case "trial":
    case "active":
      return { canRide: true, canView: true };
    case "lapsed":
    case "cancelled":
      return { canRide: false, canView: true };
  }
}
