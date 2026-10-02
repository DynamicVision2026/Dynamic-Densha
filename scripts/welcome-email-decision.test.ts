import assert from "node:assert/strict";
import { test } from "node:test";
import { shouldSendWelcomeEmail } from "../src/lib/email/welcome-email-decision.ts";

test("sends only for orders/paid, a new delivery, and a resolved plan", () => {
  assert.equal(shouldSendWelcomeEmail({ topic: "orders/paid", wasNewDelivery: true, plan: "annual" }), true);
  assert.equal(shouldSendWelcomeEmail({ topic: "orders/paid", wasNewDelivery: true, plan: "buyout" }), true);
});

test("never sends for orders/cancelled, regardless of plan or delivery freshness", () => {
  assert.equal(shouldSendWelcomeEmail({ topic: "orders/cancelled", wasNewDelivery: true, plan: "annual" }), false);
});

test("never sends on a replay -- a Shopify retry must not duplicate the welcome email", () => {
  assert.equal(shouldSendWelcomeEmail({ topic: "orders/paid", wasNewDelivery: false, plan: "annual" }), false);
});

test("never sends when the variant doesn't resolve to a plan -- another brand's product, or an unmapped variant", () => {
  assert.equal(shouldSendWelcomeEmail({ topic: "orders/paid", wasNewDelivery: true, plan: undefined }), false);
});

test("refunds/create is never a valid topic for this gate (not even passed undefined by the caller, but defensively false)", () => {
  assert.equal(shouldSendWelcomeEmail({ topic: "refunds/create", wasNewDelivery: true, plan: "annual" }), false);
});
