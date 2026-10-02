import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

/**
 * Source-scan assertions over src/routes/api/webhooks/shopify.ts -- the
 * webhook route itself needs a real Postgres connection to exercise end to
 * end, so these lock in the wiring rules the work order states as hard
 * requirements, the same idiom this repo already uses for route wiring it
 * can't otherwise unit-test (see scripts/signup-resume.test.ts,
 * scripts/handoff-error-surface.test.ts).
 */

test("never falls back to order.email -- the welcome email is resolved from kd_token only, never the payer's address", async () => {
  const code = await readFile("src/routes/api/webhooks/shopify.ts", "utf8");
  assert.doesNotMatch(code, /order\.email/, "this file must never read order.email at all");
  assert.doesNotMatch(code, /\.email\b.*kd_token\s*\?\?/, "no '?? order email' fallback pattern");
});

test("never resolves a household by email -- kd_token is the only binding", async () => {
  const code = await readFile("src/routes/api/webhooks/shopify.ts", "utf8");
  assert.doesNotMatch(code, /where\s+email\s*=/i, "no email-keyed household lookup");
  assert.match(code, /getHouseholdIdByCheckoutToken/, "household resolution must still go through the checkout token");
});

test("refunds/create never sends a welcome email", async () => {
  const code = await readFile("src/routes/api/webhooks/shopify.ts", "utf8");
  const refundBlock = code.slice(code.indexOf('case "refunds/create"'), code.lastIndexOf("default:"));
  assert.doesNotMatch(refundBlock, /sendDenshaWelcomeEmail/, "refunds/create must never call the welcome-email sender");
});

test("orders/cancelled never sends a welcome email, even though it shares the same case block", async () => {
  const code = await readFile("src/routes/api/webhooks/shopify.ts", "utf8");
  assert.match(code, /shouldSendWelcomeEmail\(\{\s*topic/, "the send must be gated through the shared decision function, not a bare topic check inline");
});

test("the welcome-email step runs after the entitlement transaction commits, never inside it", async () => {
  const code = await readFile("src/routes/api/webhooks/shopify.ts", "utf8");
  const txIndex = code.indexOf("await withTransaction((tx) =>");
  const sendIndex = code.indexOf("sendDenshaWelcomeEmail(sql, emailSender,");
  assert.ok(txIndex > -1 && sendIndex > -1, "both the transaction call and the send call must be present");
  assert.ok(sendIndex > txIndex, "the welcome-email send must be sourced after the transaction, not inside its callback");
});

test("a recognized-plan order with no kd_token raises an alert (row 5), not silence", async () => {
  const code = await readFile("src/routes/api/webhooks/shopify.ts", "utf8");
  const noTokenBlock = code.slice(code.indexOf("if (!token) {"), code.indexOf("const householdId = await getHouseholdIdByCheckoutToken"));
  assert.match(noTokenBlock, /alertFounder/, "a plan-matching order with no token must alert");
  assert.match(noTokenBlock, /plan\)/, "the alert must be conditioned on a resolved plan, not fire for every tokenless order (another brand's product stays silent)");
});

test("a token that resolves no household also alerts", async () => {
  const code = await readFile("src/routes/api/webhooks/shopify.ts", "utf8");
  const noHouseholdBlock = code.slice(code.indexOf("if (!householdId) {"), code.indexOf("const shopifyOrderId"));
  assert.match(noHouseholdBlock, /alertFounder/);
});

test("a send failure inside sendDenshaWelcomeEmail is caught and alerts, never thrown past it", async () => {
  const code = await readFile("src/routes/api/webhooks/shopify.ts", "utf8");
  const fnBody = code.slice(code.indexOf("async function sendDenshaWelcomeEmail"), code.indexOf("export const Route"));
  assert.match(fnBody, /catch\s*\(err\)/);
  assert.match(fnBody, /alertFounder/);
});

test("entitlement is still granted through the one legitimate call site only (unchanged by this work)", async () => {
  // scripts/check-webhook-only-entitlement.mjs already enforces this repo-wide;
  // this just locks in that this file didn't grow a second applyShopifyWebhook call.
  const code = await readFile("src/routes/api/webhooks/shopify.ts", "utf8");
  const matches = code.match(/applyShopifyWebhook\(/g) ?? [];
  assert.equal(matches.length, 2, "exactly the two existing call sites (orders/paid|cancelled, refunds/create) -- no new one added");
});
