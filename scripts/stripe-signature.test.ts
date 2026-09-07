import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { verifyStripeWebhookSignature } from "../src/lib/stripe-signature.ts";

const SECRET = "whsec_test_stripe_webhook_secret";
const BODY = JSON.stringify({ id: "evt_123", type: "checkout.session.completed" });
const NOW_MS = Date.parse("2026-09-10T00:00:00Z");
const NOW_SECONDS = Math.floor(NOW_MS / 1000);

function header(body: string, secret: string, timestampSeconds: number): string {
  const signedPayload = `${timestampSeconds}.${body}`;
  const v1 = createHmac("sha256", secret).update(signedPayload, "utf8").digest("hex");
  return `t=${timestampSeconds},v1=${v1}`;
}

test("a correctly-signed, fresh body verifies", () => {
  const h = header(BODY, SECRET, NOW_SECONDS);
  assert.equal(verifyStripeWebhookSignature(BODY, h, SECRET, NOW_MS), true);
});

test("a tampered body fails verification even with a valid-shaped signature", () => {
  const h = header(BODY, SECRET, NOW_SECONDS);
  const tampered = BODY.replace("evt_123", "evt_456");
  assert.equal(verifyStripeWebhookSignature(tampered, h, SECRET, NOW_MS), false);
});

test("the wrong secret fails verification", () => {
  const h = header(BODY, "wrong-secret", NOW_SECONDS);
  assert.equal(verifyStripeWebhookSignature(BODY, h, SECRET, NOW_MS), false);
});

test("a missing header or secret never verifies", () => {
  assert.equal(verifyStripeWebhookSignature(BODY, "", SECRET, NOW_MS), false);
  assert.equal(verifyStripeWebhookSignature(BODY, header(BODY, SECRET, NOW_SECONDS), "", NOW_MS), false);
});

test("a forged header with no real signature is rejected", () => {
  assert.equal(verifyStripeWebhookSignature(BODY, `t=${NOW_SECONDS},v1=not-a-real-signature`, SECRET, NOW_MS), false);
});

test("a signature older than the tolerance window is rejected (replay protection)", () => {
  const staleSeconds = NOW_SECONDS - 301; // just past the default 300s tolerance
  const h = header(BODY, SECRET, staleSeconds);
  assert.equal(verifyStripeWebhookSignature(BODY, h, SECRET, NOW_MS), false);
});

test("a signature within the tolerance window still verifies", () => {
  const recentSeconds = NOW_SECONDS - 299;
  const h = header(BODY, SECRET, recentSeconds);
  assert.equal(verifyStripeWebhookSignature(BODY, h, SECRET, NOW_MS), true);
});

test("a custom tolerance is honored", () => {
  const seconds = NOW_SECONDS - 10;
  const h = header(BODY, SECRET, seconds);
  assert.equal(verifyStripeWebhookSignature(BODY, h, SECRET, NOW_MS, 5), false);
  assert.equal(verifyStripeWebhookSignature(BODY, h, SECRET, NOW_MS, 60), true);
});

test("a second v1 value (secret rotation) verifies if either matches", () => {
  const signedPayload = `${NOW_SECONDS}.${BODY}`;
  const correct = createHmac("sha256", SECRET).update(signedPayload, "utf8").digest("hex");
  const decoy = createHmac("sha256", "decoy-secret").update(signedPayload, "utf8").digest("hex");
  const h = `t=${NOW_SECONDS},v1=${decoy},v1=${correct}`;
  assert.equal(verifyStripeWebhookSignature(BODY, h, SECRET, NOW_MS), true);
});

test("a legacy v0-only header (no v1) is rejected", () => {
  const signedPayload = `${NOW_SECONDS}.${BODY}`;
  const v0 = createHmac("sha1", SECRET).update(signedPayload, "utf8").digest("hex");
  const h = `t=${NOW_SECONDS},v0=${v0}`;
  assert.equal(verifyStripeWebhookSignature(BODY, h, SECRET, NOW_MS), false);
});
