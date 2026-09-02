/**
 * Pure HMAC verification, split out from server/webhooks.ts (which also
 * imports @/lib/server/subscription and therefore can't be loaded by the
 * plain-node test runner without Vite's path aliasing) the same way
 * entitlement.ts is kept separate from anything that touches a DB.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Shopify signs each webhook body with HMAC-SHA256, base64-encoded, sent in
 * the X-Shopify-Hmac-Sha256 header. Constant-time comparison so a timing
 * side-channel can't leak the correct signature one byte at a time.
 */
export function verifyShopifyWebhookSignature(rawBody: string, hmacHeader: string, secret: string): boolean {
  if (!hmacHeader || !secret) return false;
  const computed = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  const a = Buffer.from(computed);
  const b = Buffer.from(hmacHeader);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
