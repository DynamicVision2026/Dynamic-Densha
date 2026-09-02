import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { verifyShopifyWebhookSignature } from "../src/lib/shopify-signature.ts";

const SECRET = "test-shopify-webhook-secret";
const BODY = JSON.stringify({ id: 123, type: "subscription_created" });

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("base64");
}

test("a correctly-signed body verifies", () => {
  assert.equal(verifyShopifyWebhookSignature(BODY, sign(BODY, SECRET), SECRET), true);
});

test("a tampered body fails verification even with the right-looking signature format", () => {
  const tampered = BODY.replace("123", "456");
  assert.equal(verifyShopifyWebhookSignature(tampered, sign(BODY, SECRET), SECRET), false);
});

test("the wrong secret fails verification", () => {
  assert.equal(verifyShopifyWebhookSignature(BODY, sign(BODY, "wrong-secret"), SECRET), false);
});

test("a missing header or secret never verifies", () => {
  assert.equal(verifyShopifyWebhookSignature(BODY, "", SECRET), false);
  assert.equal(verifyShopifyWebhookSignature(BODY, sign(BODY, SECRET), ""), false);
});

test("a forged return-URL style claim with no real signature is rejected", () => {
  // Spec §6.2: entitlement is granted by webhook, never by the return URL --
  // this is the concrete shape of "someone who reads a URL once": a
  // plausible-looking but unsigned/garbage header value.
  assert.equal(verifyShopifyWebhookSignature(BODY, "not-a-real-signature==", SECRET), false);
});
