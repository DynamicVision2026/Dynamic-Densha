/**
 * Pure signature verification, split out from server/webhooks.ts (which also
 * imports @/lib/server/subscription and therefore can't be loaded by the
 * plain-node test runner without Vite's path aliasing) the same way
 * shopify-signature.ts was before it.
 *
 * Stripe signs each webhook delivery differently from Shopify: the header is
 * `Stripe-Signature: t=<unix seconds>,v1=<hex hmac>[,v1=<hex hmac>...][,v0=...]`.
 * The signed payload is `${t}.${rawBody}` (NOT the raw body alone), hashed
 * with HMAC-SHA256 and hex-encoded (not base64, unlike Shopify). Multiple
 * v1 values can appear during a webhook-secret rotation -- verifying against
 * any one of them is correct and is what Stripe's own libraries do. `v0` is
 * a legacy scheme and is ignored on purpose, matching Stripe's guidance to
 * only check v1.
 *
 * The timestamp is also checked against `nowMs` within `toleranceSeconds`
 * (Stripe's own default is 300s / 5 minutes) -- without this, a signature
 * captured once (e.g. from a compromised log) would verify forever, since
 * HMAC alone says nothing about replay, only about tampering.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_TOLERANCE_SECONDS = 300;

function parseSignatureHeader(header: string): { timestamp: string | null; v1Signatures: string[] } {
  let timestamp: string | null = null;
  const v1Signatures: string[] = [];
  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === "t" && value) timestamp = value;
    else if (key === "v1" && value) v1Signatures.push(value);
  }
  return { timestamp, v1Signatures };
}

export function verifyStripeWebhookSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string,
  nowMs: number = Date.now(),
  toleranceSeconds: number = DEFAULT_TOLERANCE_SECONDS,
): boolean {
  if (!signatureHeader || !secret) return false;

  const { timestamp, v1Signatures } = parseSignatureHeader(signatureHeader);
  if (!timestamp || v1Signatures.length === 0) return false;

  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) return false;
  if (Math.abs(nowMs - timestampSeconds * 1000) > toleranceSeconds * 1000) return false;

  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = createHmac("sha256", secret).update(signedPayload, "utf8").digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");

  return v1Signatures.some((sig) => {
    const sigBuf = Buffer.from(sig, "utf8");
    if (sigBuf.length !== expectedBuf.length) return false;
    return timingSafeEqual(expectedBuf, sigBuf);
  });
}
