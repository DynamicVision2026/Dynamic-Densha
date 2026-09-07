/**
 * Stripe webhook intake (commerce spec §6.2/§6.3). This is the ONLY place
 * in the app that ever inserts a billing_event -- which makes it, via
 * subscription-derive.ts's fold, the only path by which a household's state
 * can become 'active'. There is deliberately no other function anywhere
 * that grants entitlement; scripts/check-webhook-only-entitlement.mjs
 * enforces that no route handler does it another way.
 *
 * `householdId` is resolved by the caller (src/routes/api/webhooks/stripe.ts)
 * before this function is ever reached -- never by email. For
 * checkout.session.completed that's Stripe's own `client_reference_id` (the
 * household's opaque checkout_token); for every later event
 * (invoice.payment_succeeded/failed, customer.subscription.deleted/updated,
 * charge.refunded) it's a lookup of `stripe_customer_id`/
 * `stripe_subscription_id` against the subscription row this function
 * itself caches on the first event.
 */
import { randomUUID } from "node:crypto";
import { recomputeSubscription } from "@/lib/server/subscription";
import type { BillingEventInput } from "@/lib/subscription-derive";

export { verifyStripeWebhookSignature } from "@/lib/stripe-signature";

type Sql = {
  <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]>;
};

/**
 * Idempotent: stripe_event_id's uniqueness is the mechanism (spec §6.3/§7)
 * -- a retried delivery conflicts on insert and is dropped before the fold
 * ever sees it twice. Recompute runs regardless of whether this specific
 * delivery was new; that's safe and cheap, since deriveSubscription is a
 * pure fold over whatever's actually stored.
 */
export async function applyStripeWebhook(
  sql: Sql,
  input: {
    householdId: string;
    stripeEventId: string;
    type: BillingEventInput["type"];
    payload: Record<string, unknown>;
    receivedAt?: string;
  },
) {
  const receivedAt = input.receivedAt ?? new Date().toISOString();
  const inserted = await sql<{ id: string }>`
    insert into billing_event (id, household_id, stripe_event_id, type, payload, received_at)
    values (
      ${`be_${randomUUID()}`}, ${input.householdId}, ${input.stripeEventId}, ${input.type},
      ${JSON.stringify(input.payload)}, ${receivedAt}
    )
    on conflict (stripe_event_id) do nothing
    returning id
  `;
  const wasNewDelivery = inserted.length > 0;
  const derived = await recomputeSubscription(sql, input.householdId, receivedAt);
  return { wasNewDelivery, derived };
}
