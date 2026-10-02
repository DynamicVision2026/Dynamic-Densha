/**
 * Pure gating logic for the webhook's welcome-email step, pulled out of
 * src/routes/api/webhooks/shopify.ts so it's testable without a database or
 * a fetch mock. Three independent conditions, all required:
 *
 *  - `orders/paid` only -- never `orders/cancelled` (that topic exists for
 *    entitlement bookkeeping, never a welcome).
 *  - a NEW delivery only -- a replay (same Shopify order already recorded)
 *    must never re-send, matching the existing billing_event uniqueness
 *    the webhook already relies on for entitlement.
 *  - `plan` resolved -- this reuses entitlement's own variant-id allow-list
 *    (src/lib/shopify-plan.ts) rather than a second list. An order whose
 *    variant doesn't match either plan is not recognizably a Densha
 *    purchase, so nothing sends for it, the same as any other brand's order.
 */
import type { Plan } from "../subscription-derive";

export function shouldSendWelcomeEmail(input: {
  topic: string;
  wasNewDelivery: boolean;
  plan: Plan | undefined;
}): boolean {
  return input.topic === "orders/paid" && input.wasNewDelivery && input.plan !== undefined;
}
