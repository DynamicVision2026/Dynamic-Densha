import assert from "node:assert/strict";
import { test } from "node:test";
import { entitlement, parentTrialBanner, type SubscriptionSnapshot, type SubscriptionState } from "../src/lib/entitlement.ts";

const NOW = "2026-09-05T12:00:00.000Z";

function snap(
  state: SubscriptionState,
  effectiveTrialEnd: string | null = null,
  paidUntil: string | null = null,
): SubscriptionSnapshot {
  return { state, effectiveTrialEnd, paidUntil };
}

test("guest/trial/active can ride and can view", () => {
  for (const state of ["guest", "trial", "active"] as const) {
    const e = entitlement(snap(state), NOW);
    assert.equal(e.canRide, true, state);
    assert.equal(e.canView, true, state);
  }
});

test("lapsed/cancelled cannot ride but can always view", () => {
  for (const state of ["lapsed", "cancelled"] as const) {
    const e = entitlement(snap(state), NOW);
    assert.equal(e.canRide, false, state);
    assert.equal(e.canView, true, state);
  }
});

test("canView is never false, across every state", () => {
  for (const state of ["guest", "trial", "active", "lapsed", "cancelled"] as const) {
    assert.equal(entitlement(snap(state), NOW).canView, true, state);
  }
});

test("a trial before its effective end still rides", () => {
  const e = entitlement(snap("trial", "2026-09-10T14:59:59.999Z"), NOW);
  assert.equal(e.canRide, true);
});

test("a trial whose real deadline has already passed cannot ride, even though the cached state still says trial", () => {
  // No webhook tells the app a trial expired -- this is the one transition
  // entitlement() must catch by comparing the clock, not by trusting state.
  const e = entitlement(snap("trial", "2026-09-01T14:59:59.999Z"), NOW);
  assert.equal(e.canRide, false);
  assert.equal(e.canView, true);
});

test("active with paid_until null (a buyout) rides forever -- no date ever lapses it", () => {
  const e = entitlement(snap("active", null, null), "2099-01-01T00:00:00.000Z");
  assert.equal(e.canRide, true);
});

test("active with paid_until in the future (an annual pass still within its year) rides", () => {
  const e = entitlement(snap("active", null, "2026-12-01T00:00:00.000Z"), NOW);
  assert.equal(e.canRide, true);
});

test("active whose paid_until has already passed cannot ride, even though the cached state still says active -- Shopify sends no renewal webhook for a one-time annual pass", () => {
  const e = entitlement(snap("active", null, "2026-09-01T00:00:00.000Z"), NOW);
  assert.equal(e.canRide, false);
  assert.equal(e.canView, true);
});

test("active exactly at paid_until (the instant it expires) cannot ride -- the boundary is exclusive", () => {
  const e = entitlement(snap("active", null, NOW), NOW);
  assert.equal(e.canRide, false);
});

test("parentTrialBanner shows the trial end date while trialing", () => {
  const b = parentTrialBanner(snap("trial", "2026-09-10T14:59:59.999Z"), NOW);
  assert.deepEqual(b, { kind: "trialing", trialEndsAt: "2026-09-10T14:59:59.999Z" });
});

test("parentTrialBanner reads a naturally-expired trial the same as one backdated at creation -- both are just 'trialEnded'", () => {
  // A trial that ran its normal ten days and one backdated to `now` at
  // household creation (spec §2.2 trial_spent) are indistinguishable in
  // `subscription` once expired -- the banner doesn't need to tell them
  // apart, it's the same dead-end-with-an-exit copy either way.
  const naturallyExpired = parentTrialBanner(snap("trial", "2026-09-01T00:00:00.000Z"), NOW);
  // Household created moments ago with trial_ends_at backdated to that
  // instant (resolveHouseholdId's repeat-email branch) -- checked here one
  // second later, as the very next request always will be in practice.
  const backdatedAtCreation = parentTrialBanner(snap("trial", "2026-09-05T11:59:59.000Z"), NOW);
  assert.deepEqual(naturallyExpired, { kind: "trialEnded" });
  assert.deepEqual(backdatedAtCreation, { kind: "trialEnded" });
});

test("parentTrialBanner reads an expired annual pass the same way -- 'trialEnded' copy, reused generically for any lapse", () => {
  const b = parentTrialBanner(snap("active", null, "2026-09-01T00:00:00.000Z"), NOW);
  assert.deepEqual(b, { kind: "trialEnded" });
});

test("parentTrialBanner is 'cancelled' for a cancelled subscription, 'none' for guest/active", () => {
  assert.deepEqual(parentTrialBanner(snap("cancelled"), NOW), { kind: "cancelled" });
  assert.deepEqual(parentTrialBanner(snap("active", null, null), NOW), { kind: "none" });
  assert.deepEqual(parentTrialBanner(snap("guest"), NOW), { kind: "none" });
});
