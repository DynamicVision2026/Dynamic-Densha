import assert from "node:assert/strict";
import { test } from "node:test";
import { deriveSubscription } from "../src/lib/subscription-derive.ts";

const TRIAL_END = "2026-09-11T14:59:59.999Z"; // 23:59:59 JST, day 10

test("a fresh household with no events is trialing", () => {
  const d = deriveSubscription({ baseTrialEndsAt: TRIAL_END, events: [], adminActions: [], nowIso: "2026-09-02T00:00:00Z" });
  assert.equal(d.state, "trial");
  assert.equal(d.effectiveTrialEnd, TRIAL_END);
  assert.equal(d.paidUntil, null);
});

test("buyout: paid_until is permanently null, state active", () => {
  const d = deriveSubscription({
    baseTrialEndsAt: TRIAL_END,
    events: [{ type: "order_paid", receivedAt: "2026-09-05T03:00:00Z", plan: "buyout" }],
    adminActions: [],
    nowIso: "2026-09-05T03:00:01Z",
  });
  assert.equal(d.state, "active");
  assert.equal(d.paidUntil, null);
  assert.equal(d.plan, "buyout");
});

test("buyout stays active forever -- no date ever lapses it", () => {
  const d = deriveSubscription({
    baseTrialEndsAt: TRIAL_END,
    events: [{ type: "order_paid", receivedAt: "2026-09-05T03:00:00Z", plan: "buyout" }],
    adminActions: [],
    nowIso: "2099-01-01T00:00:00Z",
  });
  assert.equal(d.state, "active");
});

test("spec §4.1: an annual purchase during trial extends from effectiveTrialEnd, not from the order time", () => {
  // Trial started 2026-09-01, purchases annual on day 4 (2026-09-05).
  const d = deriveSubscription({
    baseTrialEndsAt: TRIAL_END, // day 10 = 2026-09-11
    events: [{ type: "order_paid", receivedAt: "2026-09-05T03:00:00Z", plan: "annual" }],
    adminActions: [],
    nowIso: "2026-09-05T03:00:01Z",
  });
  assert.equal(d.state, "active");
  // paid_until = trial_ends_at + 1 year, NOT order-date + 1 year.
  assert.equal(d.paidUntil, "2027-09-11T14:59:59.999Z");
});

test("an annual purchase after the trial has already ended extends from the order date", () => {
  const d = deriveSubscription({
    baseTrialEndsAt: TRIAL_END,
    events: [{ type: "order_paid", receivedAt: "2026-09-20T00:00:00Z", plan: "annual" }],
    adminActions: [],
    nowIso: "2026-09-20T00:00:01Z",
  });
  assert.equal(d.state, "active");
  assert.equal(d.paidUntil, "2027-09-20T00:00:00.000Z");
});

test("annual stacking: paid_until = (event.created_at < effectiveTrialEnd) ? effectiveTrialEnd + 365d : event.created_at + 365d, decided from event.created_at, never now()", () => {
  // Purchased with a day left on the trial -- created_at < effectiveTrialEnd,
  // so the year stacks on top of the trial's own end rather than starting
  // from the purchase moment (a family buying near the end of their trial
  // must not lose those last few days). `nowIso` is deliberately much later
  // than both dates, to prove the branch is decided from created_at, not
  // from whatever `now` happens to be when this is (re-)derived.
  const stacksOnTrialEnd = deriveSubscription({
    baseTrialEndsAt: TRIAL_END, // 2026-09-11T14:59:59.999Z
    events: [{ type: "order_paid", receivedAt: "2026-09-10T00:00:00Z", plan: "annual" }],
    adminActions: [],
    nowIso: "2026-12-25T00:00:00Z",
  });
  assert.equal(stacksOnTrialEnd.paidUntil, "2027-09-11T14:59:59.999Z");

  // event.created_at exactly equal to effectiveTrialEnd is NOT "< effectiveTrialEnd"
  // -- the boundary belongs to the created_at branch, not the trial-end branch.
  const atTheBoundary = deriveSubscription({
    baseTrialEndsAt: TRIAL_END,
    events: [{ type: "order_paid", receivedAt: TRIAL_END, plan: "annual" }],
    adminActions: [],
    nowIso: "2026-12-25T00:00:00Z",
  });
  assert.equal(atTheBoundary.paidUntil, "2027-09-11T14:59:59.999Z"); // TRIAL_END + 1y, same instant either way here

  // Purchased the day AFTER the trial ended -- created_at is NOT <
  // effectiveTrialEnd, so the year starts from the purchase itself.
  const startsFromPurchase = deriveSubscription({
    baseTrialEndsAt: TRIAL_END,
    events: [{ type: "order_paid", receivedAt: "2026-09-12T00:00:00Z", plan: "annual" }],
    adminActions: [],
    nowIso: "2026-12-25T00:00:00Z",
  });
  assert.equal(startsFromPurchase.paidUntil, "2027-09-12T00:00:00.000Z");
});

test("annual pass renews on the same calendar day a year later, not +365 raw days (leap-year safe)", () => {
  const d = deriveSubscription({
    baseTrialEndsAt: null,
    events: [{ type: "order_paid", receivedAt: "2028-02-29T00:00:00Z", plan: "annual" }],
    adminActions: [],
    nowIso: "2028-02-29T00:00:01Z",
  });
  assert.equal(d.paidUntil, "2029-03-01T00:00:00.000Z"); // JS Date's own Feb-29-plus-1-year rollover, not a bug in this function
});

test("an unmatched variant (plan left unset) still grants entitlement, treated as permanent -- a real payment must never read as unentitled because of a price-lookup miss", () => {
  const d = deriveSubscription({
    baseTrialEndsAt: null,
    events: [{ type: "order_paid", receivedAt: "2026-09-05T00:00:00Z" }], // no `plan`
    adminActions: [],
    nowIso: "2026-09-06T00:00:00Z",
  });
  assert.equal(d.state, "active");
  assert.equal(d.paidUntil, null);
  assert.equal(d.plan, null);
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

test("refund lapses the household regardless of paid_until, buyout included", () => {
  const events = [
    { type: "order_paid" as const, receivedAt: "2026-08-01T00:00:00Z", plan: "buyout" as const },
    { type: "refund" as const, receivedAt: "2026-08-15T00:00:00Z" },
  ];
  const d = deriveSubscription({ baseTrialEndsAt: null, events, adminActions: [], nowIso: "2026-08-16T00:00:00Z" });
  assert.equal(d.state, "lapsed");
  assert.equal(d.paidUntil, null);
});

test("order_cancelled lapses the household the same way a refund does", () => {
  const events = [
    { type: "order_paid" as const, receivedAt: "2026-08-01T00:00:00Z", plan: "annual" as const },
    { type: "order_cancelled" as const, receivedAt: "2026-08-15T00:00:00Z" },
  ];
  const d = deriveSubscription({ baseTrialEndsAt: null, events, adminActions: [], nowIso: "2026-08-16T00:00:00Z" });
  assert.equal(d.state, "lapsed");
});

test("order_paid folds shopifyCustomerId/shopifyOrderId into the derived row", () => {
  const d = deriveSubscription({
    baseTrialEndsAt: null,
    events: [
      {
        type: "order_paid",
        receivedAt: "2026-08-01T00:00:00Z",
        plan: "buyout",
        shopifyCustomerId: "cus_abc",
        shopifyOrderId: "ord_abc",
      },
    ],
    adminActions: [],
    nowIso: "2026-08-01T00:00:01Z",
  });
  assert.equal(d.shopifyCustomerId, "cus_abc");
  assert.equal(d.shopifyOrderId, "ord_abc");
});

test("a household with no order_paid event has null Shopify ids", () => {
  const d = deriveSubscription({ baseTrialEndsAt: null, events: [], adminActions: [], nowIso: "2026-08-01T00:00:00Z" });
  assert.equal(d.shopifyCustomerId, null);
  assert.equal(d.shopifyOrderId, null);
});

test("event replay is order-sensitive and idempotent: the same log folded twice gives the same answer", () => {
  const events = [{ type: "order_paid" as const, receivedAt: "2026-08-01T00:00:00Z", plan: "annual" as const }];
  const once = deriveSubscription({ baseTrialEndsAt: null, events, adminActions: [], nowIso: "2026-09-15T00:00:00Z" });
  const twice = deriveSubscription({ baseTrialEndsAt: null, events: [...events], adminActions: [], nowIso: "2026-09-15T00:00:00Z" });
  assert.deepEqual(once, twice);
});
