/**
 * Stripe webhook endpoint. This is the ONE legitimate caller of
 * applyStripeWebhook (src/lib/server/webhooks.ts) among all route files --
 * scripts/check-webhook-only-entitlement.mjs exempts exactly this path and
 * fails on every other one, so entitlement can only ever be granted here,
 * never by a return/redirect page a browser hits after checkout.
 *
 * Every household lookup below goes through an opaque id Stripe hands back
 * to us (client_reference_id, or the stripe_customer_id/stripe_
 * subscription_id this handler itself caches from checkout.session.
 * completed) -- never by email, and never by trusting a plain household_id
 * a client could send.
 */
import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { verifyStripeWebhookSignature } from "@/lib/stripe-signature";
import { applyStripeWebhook } from "@/lib/server/webhooks";
import { getHouseholdIdByCheckoutToken } from "@/lib/server/household";
import { getHouseholdIdByStripeIds } from "@/lib/server/subscription";
import { priceIdToPlan } from "@/lib/stripe-plan";
import type { Plan } from "@/lib/subscription-derive";

type StripeEvent = {
  id: string;
  type: string;
  created: number;
  data: {
    object: Record<string, unknown>;
    previous_attributes?: Record<string, unknown>;
  };
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** customer.subscription.updated fires for far more than plan/tier changes; only items moving counts as one. */
function isPlanChange(event: StripeEvent): boolean {
  return Boolean(event.data.previous_attributes && "items" in event.data.previous_attributes);
}

/**
 * customer.subscription.updated's data.object IS the full Subscription,
 * items included inline -- no extra API call needed here, unlike
 * checkout.session.completed below (whose data.object is the CheckoutSession,
 * which only carries `subscription` as a bare id string).
 */
function priceIdFromSubscriptionItems(object: Record<string, unknown>): string | undefined {
  const items = object.items as { data?: Array<{ price?: { id?: string } }> } | undefined;
  return items?.data?.[0]?.price?.id;
}

/**
 * checkout.session.completed's payload has no line items inline (that needs
 * an `expand` a plain webhook delivery can't ask for, and a bare Payment
 * Link URL has no metadata-passthrough mechanism the way a dynamically-
 * created Checkout Session would) -- so this is the one place in the whole
 * pipeline that makes a real Stripe API call, fetching the subscription
 * checkout.session.completed itself just created to read its price id off
 * `items.data[0].price.id`, the same field customer.subscription.updated
 * already gets for free.
 */
async function fetchSubscriptionPriceId(subscriptionId: string, secretKey: string): Promise<string | undefined> {
  const res = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
    headers: { Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}` },
  });
  if (!res.ok) {
    console.error(`stripe webhook: failed to fetch subscription ${subscriptionId} for price lookup (HTTP ${res.status})`);
    return undefined;
  }
  const body = (await res.json()) as { items?: { data?: Array<{ price?: { id?: string } }> } };
  return body.items?.data?.[0]?.price?.id;
}

/**
 * Resolves a Plan from a price id, logging (never guessing) when the price
 * doesn't match either configured id -- see stripe-plan.ts's own comment for
 * why this must never fall back to a default.
 */
function resolvePlan(priceId: string | undefined, context: string): Plan | undefined {
  if (!priceId) return undefined;
  const plan = priceIdToPlan(priceId);
  if (!plan) {
    console.error(
      `stripe webhook (${context}): price ${priceId} matches neither STRIPE_PRICE_MONTHLY_ID nor STRIPE_PRICE_ANNUAL_ID -- plan left unset`,
    );
  }
  return plan;
}

export const Route = createFileRoute("/api/webhooks/stripe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret =
          typeof process !== "undefined" ? process.env.STRIPE_WEBHOOK_SECRET : undefined;
        if (!secret) {
          // Fail closed, the same way scripts/migrate.mjs refuses without
          // DATABASE_URL rather than silently skipping -- an unset secret
          // must never be read as "accept everything unverified."
          console.error("stripe webhook: STRIPE_WEBHOOK_SECRET is not configured, refusing all deliveries");
          return json(500, { error: "webhook not configured" });
        }

        const rawBody = await request.text();
        const signatureHeader = request.headers.get("stripe-signature") ?? "";
        if (!verifyStripeWebhookSignature(rawBody, signatureHeader, secret)) {
          return json(400, { error: "invalid signature" });
        }

        let event: StripeEvent;
        try {
          event = JSON.parse(rawBody);
        } catch {
          return json(400, { error: "invalid JSON" });
        }

        const sql = await getSql();
        const receivedAt = new Date(event.created * 1000).toISOString();
        const object = event.data.object;

        switch (event.type) {
          case "checkout.session.completed": {
            const token = object.client_reference_id as string | null | undefined;
            if (!token) return json(200, { ok: true, skipped: "no client_reference_id" });

            const householdId = await getHouseholdIdByCheckoutToken(sql, token);
            if (!householdId) return json(200, { ok: true, skipped: "no household for token" });

            const subscriptionId = (object.subscription as string | null | undefined) ?? undefined;
            const secretKey = typeof process !== "undefined" ? process.env.STRIPE_SECRET_KEY : undefined;
            let plan: Plan | undefined;
            if (!subscriptionId) {
              console.error("stripe webhook (checkout.session.completed): no subscription id on the session, plan left unset");
            } else if (!secretKey) {
              console.error(
                "stripe webhook (checkout.session.completed): STRIPE_SECRET_KEY is not configured, cannot look up the price, plan left unset",
              );
            } else {
              const priceId = await fetchSubscriptionPriceId(subscriptionId, secretKey);
              plan = resolvePlan(priceId, "checkout.session.completed");
            }

            await applyStripeWebhook(sql, {
              householdId,
              stripeEventId: event.id,
              type: "subscription_created",
              payload: {
                plan,
                stripeCustomerId: (object.customer as string | null | undefined) ?? undefined,
                stripeSubscriptionId: subscriptionId,
              },
              receivedAt,
            });
            return json(200, { ok: true });
          }

          case "invoice.payment_succeeded":
          case "invoice.payment_failed": {
            const householdId = await getHouseholdIdByStripeIds(sql, {
              customerId: object.customer as string | null | undefined,
              subscriptionId: object.subscription as string | null | undefined,
            });
            if (!householdId) {
              // Not necessarily forged -- this invoice event may simply have
              // raced ahead of checkout.session.completed's own delivery, in
              // which case stripe_subscription_id isn't cached yet. A non-2xx
              // makes Stripe retry with backoff, giving that event time to
              // land first, unlike checkout.session.completed's own missing-
              // token case above (a permanently bad token, not a race).
              return json(409, { error: "household not yet linked to this Stripe subscription/customer" });
            }
            await applyStripeWebhook(sql, {
              householdId,
              stripeEventId: event.id,
              type: event.type === "invoice.payment_succeeded" ? "subscription_charge_succeeded" : "subscription_charge_failed",
              payload: {},
              receivedAt,
            });
            return json(200, { ok: true });
          }

          case "customer.subscription.deleted": {
            const householdId = await getHouseholdIdByStripeIds(sql, {
              customerId: object.customer as string | null | undefined,
              subscriptionId: object.id as string | null | undefined,
            });
            if (!householdId) return json(409, { error: "household not yet linked to this Stripe subscription/customer" });
            await applyStripeWebhook(sql, {
              householdId,
              stripeEventId: event.id,
              type: "subscription_cancelled",
              payload: {},
              receivedAt,
            });
            return json(200, { ok: true });
          }

          case "customer.subscription.updated": {
            if (!isPlanChange(event)) return json(200, { ok: true, skipped: "not a plan/tier change" });
            const householdId = await getHouseholdIdByStripeIds(sql, {
              customerId: object.customer as string | null | undefined,
              subscriptionId: object.id as string | null | undefined,
            });
            if (!householdId) return json(409, { error: "household not yet linked to this Stripe subscription/customer" });
            await applyStripeWebhook(sql, {
              householdId,
              stripeEventId: event.id,
              type: "plan_changed",
              payload: { plan: resolvePlan(priceIdFromSubscriptionItems(object), "customer.subscription.updated") },
              receivedAt,
            });
            return json(200, { ok: true });
          }

          case "charge.refunded": {
            const householdId = await getHouseholdIdByStripeIds(sql, {
              customerId: object.customer as string | null | undefined,
            });
            if (!householdId) return json(409, { error: "household not yet linked to this Stripe customer" });
            await applyStripeWebhook(sql, {
              householdId,
              stripeEventId: event.id,
              type: "refund",
              payload: {},
              receivedAt,
            });
            return json(200, { ok: true });
          }

          default:
            // Stripe sends far more event types than this app acts on --
            // acknowledge and ignore anything not explicitly handled above,
            // never error on it.
            return json(200, { ok: true, skipped: "unhandled event type" });
        }
      },
    },
  },
});
