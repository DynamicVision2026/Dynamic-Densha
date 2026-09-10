/**
 * Shopify webhook intake (commerce spec §6.2/§6.3). This is the ONLY place
 * in the app that ever inserts a billing_event -- which makes it, via
 * subscription-derive.ts's fold, the only path by which a household's state
 * can become 'active'. There is deliberately no other function anywhere
 * that grants entitlement; scripts/check-webhook-only-entitlement.mjs
 * enforces that no route handler does it another way.
 *
 * `householdId` is resolved by the caller (src/routes/api/webhooks/
 * shopify.ts) before this function is ever reached -- never by email. For
 * orders/paid and orders/cancelled that's the order payload's own
 * `note_attributes.kd_token` (the household's opaque checkout_token,
 * round-tripped from the Shopify cart permalink -- see src/lib/shopify-
 * checkout.ts). refunds/create carries no note_attributes of its own, so
 * that one resolves via getHouseholdIdByShopifyOrderId instead (see
 * src/lib/server/subscription.ts).
 */
import { randomUUID } from "node:crypto";
import { recomputeSubscription } from "@/lib/server/subscription";
import type { BillingEventInput } from "@/lib/subscription-derive";

export { verifyShopifyWebhookSignature } from "@/lib/shopify-signature";

type Sql = {
  <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]>;
};

/**
 * Idempotent: shopify_event_id's uniqueness is the mechanism (spec §6.3/§7)
 * -- a retried delivery (X-Shopify-Webhook-Id) conflicts on insert and is
 * dropped before the fold ever sees it twice. Recompute runs regardless of
 * whether this specific delivery was new; that's safe and cheap, since
 * deriveSubscription is a pure fold over whatever's actually stored.
 */
export async function applyShopifyWebhook(
  sql: Sql,
  input: {
    householdId: string;
    shopifyEventId: string;
    type: BillingEventInput["type"];
    payload: Record<string, unknown>;
    receivedAt?: string;
  },
) {
  const receivedAt = input.receivedAt ?? new Date().toISOString();
  const inserted = await sql<{ id: string }>`
    insert into billing_event (id, household_id, shopify_event_id, type, payload, received_at)
    values (
      ${`be_${randomUUID()}`}, ${input.householdId}, ${input.shopifyEventId}, ${input.type},
      ${JSON.stringify(input.payload)}, ${receivedAt}
    )
    on conflict (shopify_event_id) do nothing
    returning id
  `;
  const wasNewDelivery = inserted.length > 0;
  const derived = await recomputeSubscription(sql, input.householdId, receivedAt);
  return { wasNewDelivery, derived };
}
