/**
 * Shopify webhook intake (commerce spec §6.2/§6.3). This is the ONLY place
 * in the app that ever inserts a billing_event -- which makes it, via
 * subscription-derive.ts's fold, the only path by which a household's state
 * can become 'active'. There is deliberately no other function anywhere
 * that grants entitlement; scripts/check-webhook-only-entitlement.mjs
 * enforces that no route handler does it another way.
 *
 * Not wired to a real HTTP endpoint or a real Shopify app in this pass --
 * that needs an actual Shopify webhook secret and a configured store, which
 * this environment doesn't have. What's here is the verification and
 * apply logic itself, real and testable independent of that.
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
 * -- a retried delivery conflicts on insert and is dropped before the fold
 * ever sees it twice. Recompute runs regardless of whether this specific
 * delivery was new; that's safe and cheap, since deriveSubscription is a
 * pure fold over whatever's actually stored.
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
