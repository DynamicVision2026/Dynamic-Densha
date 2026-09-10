import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { verifyShopifyWebhookSignature } from "../src/lib/shopify-signature.ts";

const SECRET = "shpss_test_shopify_webhook_secret";
const BODY = JSON.stringify({ id: 4909198572685, order_number: 1001 });

function hmac(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("base64");
}

test("a correctly-signed body verifies", () => {
  assert.equal(verifyShopifyWebhookSignature(BODY, hmac(BODY, SECRET), SECRET), true);
});

test("a tampered body fails verification even with a valid-shaped signature", () => {
  const tampered = BODY.replace("1001", "1002");
  assert.equal(verifyShopifyWebhookSignature(tampered, hmac(BODY, SECRET), SECRET), false);
});

test("the wrong secret fails verification", () => {
  assert.equal(verifyShopifyWebhookSignature(BODY, hmac(BODY, "wrong-secret"), SECRET), false);
});

test("a missing header or secret never verifies", () => {
  assert.equal(verifyShopifyWebhookSignature(BODY, "", SECRET), false);
  assert.equal(verifyShopifyWebhookSignature(BODY, hmac(BODY, SECRET), ""), false);
});

test("a forged header with no real signature is rejected", () => {
  assert.equal(verifyShopifyWebhookSignature(BODY, "not-a-real-signature", SECRET), false);
});

test("a signature of a different length is rejected without throwing", () => {
  assert.equal(verifyShopifyWebhookSignature(BODY, "dG9vc2hvcnQ=", SECRET), false);
});

test("a payload containing multibyte Japanese characters verifies correctly", () => {
  // The exact failure mode this test guards against: computing the HMAC over
  // a byte length or encoding that doesn't match what Shopify actually sent
  // (e.g. UTF-16 code units instead of UTF-8 bytes) would make every webhook
  // carrying a Japanese parent/child name fail signature verification.
  const body = JSON.stringify({
    id: 4909198572685,
    note_attributes: [
      { name: "kd_token", value: "tok_abc123" },
      { name: "kd_plan", value: "buyout" },
    ],
    customer: { first_name: "花子", last_name: "山田" },
    note: "漢字でんしゃ、よろしくお願いします。",
  });
  assert.equal(verifyShopifyWebhookSignature(body, hmac(body, SECRET), SECRET), true);
});

test("a tampered multibyte payload still fails verification", () => {
  const body = JSON.stringify({ customer: { first_name: "花子" } });
  const tampered = JSON.stringify({ customer: { first_name: "太郎" } });
  assert.equal(verifyShopifyWebhookSignature(tampered, hmac(body, SECRET), SECRET), false);
});
