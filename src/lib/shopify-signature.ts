/**
 * Pure signature verification, split out from server/webhooks.ts (which also
 * imports @/lib/server/subscription and therefore can't be loaded by the
 * plain-node test runner without Vite's path aliasing) the same way
 * stripe-signature.ts was before it.
 *
 * Shopify signs each webhook delivery with HMAC-SHA256 over the raw request
 * body, Base64-encoded (NOT hex, unlike Stripe), sent in the
 * X-Shopify-Hmac-Sha256 header. Unlike Stripe's `t=...,v1=...` scheme,
 * there's no timestamp folded into the signed payload -- Shopify has no
 * built-in HMAC replay window, so idempotency here comes entirely from
 * X-Shopify-Webhook-Id's uniqueness on billing_event (see
 * src/routes/api/webhooks/shopify.ts), not from anything checked in this
 * file. Constant-time comparison so a timing side-channel can't leak the
 * correct signature one byte at a time.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyShopifyWebhookSignature(
  rawBody: string,
  hmacHeader: string,
  secret: string,
): boolean {
  if (!hmacHeader || !secret) return false;
  const computed = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  const a = Buffer.from(computed, "utf8");
  const b = Buffer.from(hmacHeader, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
