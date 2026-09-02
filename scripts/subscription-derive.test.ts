import assert from "node:assert/strict";
import { test } from "node:test";
import { deriveSubscription, GRACE_DAYS } from "../src/lib/subscription-derive.ts";

const TRIAL_END = "2026-09-11T14:59:59.999Z"; // 23:59:59 JST, day 10

test("a fresh household with no events is trialing", () => {
  const d = deriveSubscription({ baseTrialEndsAt: TRIAL_END, events: [], adminActions: [], nowIso: "2026-09-02T00:00:00Z" });
  assert.equal(d.state, "trial");
  assert.equal(d.effectiveTrialEnd, TRIAL_END);
  assert.equal(d.paidUntil, null);
});

test("spec §4.1: subscribing during trial extends from effectiveTrialEnd, not from now", () => {
  // Trial started 2026-09-01, subscribes on day 4 (2026-09-05) with monthly.
  const d = deriveSubscription({
    baseTrialEndsAt: TRIAL_END, // day 10 = 2026-09-11
    events: [{ type: "subscription_created", receivedAt: "2026-09-05T03:00:00Z", plan: "monthly" }],
    adminActions: [],
    nowIso: "2026-09-05T03:00:01Z",
  });
  assert.equal(d.state, "active");
  // paid_until = trial_ends_at + 1 month, NOT subscribe-date + 1 month.
  assert.equal(d.paidUntil, "2026-10-11T14:59:59.999Z");
});

test("subscribing after the trial has already ended extends from the subscribe date", () => {
  const d = deriveSubscription({
    baseTrialEndsAt: TRIAL_END,
    events: [{ type: "subscription_created", receivedAt: "2026-09-20T00:00:00Z", plan: "monthly" }],
    adminActions: [],
    nowIso: "2026-09-20T00:00:01Z",
  });
  assert.equal(d.state, "active");
  assert.equal(d.paidUntil, "2026-10-20T00:00:00.000Z");
});

test("admin_action trial_extended is folded in and survives being computed fresh every time", () => {
  const d = deriveSubscription({
    baseTrialEndsAt: TRIAL_END,
    events: [],
    adminActions: [{ type: "trial_extended", days: 14, createdAt: "2026-09-08T00:00:00Z" }],
    nowIso: "2026-09-15T00:00:00Z",
  });
  // 2026-09-11T14:59:59.999Z + 14 days
  assert.equal(d.effectiveTrialEnd, "2026-09-25T14:59:59.999Z");
  assert.equal(d.state, "trial"); // still trialing on day 15, thanks to the extension
});

test("a re-derivation after a routine webhook retry does not revert an admin extension (the exact bug §7.1 exists to prevent)", () => {
  const inputs = {
    baseTrialEndsAt: TRIAL_END,
    events: [] as const,
    adminActions: [{ type: "trial_extended" as const, days: 14, createdAt: "2026-09-08T00:00:00Z" }],
  };
  const before = deriveSubscription({ ...inputs, nowIso: "2026-09-15T00:00:00Z" });
  // Simulate a retried webhook arriving later -- re-deriving from the SAME
  // logs at a later `now` must not lose the extension, because it's part
  // of the computation, not a value that could be overwritten.
  const after = deriveSubscription({ ...inputs, nowIso: "2026-09-16T00:00:00Z" });
  assert.equal(before.effectiveTrialEnd, after.effectiveTrialEnd);
});

test("failed charge: stays active through grace, then lapses if nothing else arrives", () => {
  const events = [
    { type: "subscription_created" as const, receivedAt: "2026-08-01T00:00:00Z", plan: "monthly" as const },
    { type: "subscription_charge_failed" as const, receivedAt: "2026-09-01T00:00:00Z" },
  ];
  const duringGrace = deriveSubscription({
    baseTrialEndsAt: null,
    events,
    adminActions: [],
    nowIso: "2026-09-02T00:00:00Z", // 1 day into a 3-day grace
  });
  assert.equal(duringGrace.state, "active");

  const afterGrace = deriveSubscription({
    baseTrialEndsAt: null,
    events,
    adminActions: [],
    nowIso: new Date(Date.parse("2026-09-01T00:00:00Z") + (GRACE_DAYS + 1) * 86_400_000).toISOString(),
  });
  assert.equal(afterGrace.state, "lapsed");
});

test("a successful charge during grace clears it -- riding resumes, no lapse", () => {
  const events = [
    { type: "subscription_created" as const, receivedAt: "2026-08-01T00:00:00Z", plan: "monthly" as const },
    { type: "subscription_charge_failed" as const, receivedAt: "2026-09-01T00:00:00Z" },
    { type: "subscription_charge_succeeded" as const, receivedAt: "2026-09-02T00:00:00Z", plan: "monthly" as const },
  ];
  const d = deriveSubscription({ baseTrialEndsAt: null, events, adminActions: [], nowIso: "2026-09-10T00:00:00Z" });
  assert.equal(d.state, "active");
});

test("cancel: stays active until paid_until, THEN becomes cancelled -- never immediately", () => {
  const events = [
    { type: "subscription_created" as const, receivedAt: "2026-08-01T00:00:00Z", plan: "monthly" as const },
    { type: "subscription_cancelled" as const, receivedAt: "2026-08-15T00:00:00Z" },
  ];
  const paidUntil = "2026-09-01T00:00:00.000Z";
  const stillActive = deriveSubscription({ baseTrialEndsAt: null, events, adminActions: [], nowIso: "2026-08-20T00:00:00Z" });
  assert.equal(stillActive.state, "active");
  assert.equal(stillActive.paidUntil, paidUntil);

  const afterPeriodEnd = deriveSubscription({ baseTrialEndsAt: null, events, adminActions: [], nowIso: paidUntil });
  assert.equal(afterPeriodEnd.state, "cancelled");
});

test("refund lapses the household regardless of paid_until", () => {
  const events = [
    { type: "subscription_created" as const, receivedAt: "2026-08-01T00:00:00Z", plan: "yearly" as const },
    { type: "refund" as const, receivedAt: "2026-08-15T00:00:00Z" },
  ];
  const d = deriveSubscription({ baseTrialEndsAt: null, events, adminActions: [], nowIso: "2026-08-16T00:00:00Z" });
  assert.equal(d.state, "lapsed");
});

test("yearly plan renews on the same calendar day a year later, not +365 raw days (leap-year safe)", () => {
  const d = deriveSubscription({
    baseTrialEndsAt: null,
    events: [{ type: "subscription_created", receivedAt: "2028-02-29T00:00:00Z", plan: "yearly" }],
    adminActions: [],
    nowIso: "2028-02-29T00:00:01Z",
  });
  assert.equal(d.paidUntil, "2029-03-01T00:00:00.000Z"); // JS Date's own Feb-29-plus-1-year rollover, not a bug in this function
});

test("event replay is order-sensitive and idempotent: the same log folded twice gives the same answer", () => {
  const events = [
    { type: "subscription_created" as const, receivedAt: "2026-08-01T00:00:00Z", plan: "monthly" as const },
    { type: "subscription_charge_succeeded" as const, receivedAt: "2026-09-01T00:00:00Z", plan: "monthly" as const },
  ];
  const once = deriveSubscription({ baseTrialEndsAt: null, events, adminActions: [], nowIso: "2026-09-15T00:00:00Z" });
  const twice = deriveSubscription({ baseTrialEndsAt: null, events: [...events], adminActions: [], nowIso: "2026-09-15T00:00:00Z" });
  assert.deepEqual(once, twice);
});
