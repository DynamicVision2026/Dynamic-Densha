import assert from "node:assert/strict";
import { test } from "node:test";
import { entitlement, type SubscriptionSnapshot, type SubscriptionState } from "../src/lib/entitlement.ts";

const NOW = "2026-09-05T12:00:00.000Z";

function snap(state: SubscriptionState, effectiveTrialEnd: string | null = null): SubscriptionSnapshot {
  return { state, effectiveTrialEnd };
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

test("active is trusted as-is regardless of any date field -- its lapse is always webhook-driven", () => {
  // active has no effectiveTrialEnd at all; nothing about `now` should be
  // able to flip it, since paid_until expiry is handled by Shopify firing a
  // charge-failed webhook + grace period, not by a client-side date check.
  const e = entitlement(snap("active", null), "2099-01-01T00:00:00.000Z");
  assert.equal(e.canRide, true);
});
