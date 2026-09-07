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

/**
 * JPY is a zero-decimal currency in Stripe -- a Checkout Session's
 * amount_total is already whole yen, not yen*100. This is how
 * checkout.session.completed's handler below tells monthly from yearly
 * without an extra Stripe API call: the session payload doesn't include
 * line items inline (that needs an `expand` a webhook delivery can't ask
 * for), and a plain Payment Link URL has no metadata-passthrough mechanism
 * the way a dynamically-created Checkout Session would. Update this map if
 * the prices on landingpage-densha's pricing.html ever change -- it is the
 * one place in this file that has to stay in sync with them by hand.
 */
const PLAN_BY_AMOUNT_TOTAL: Record<number, Plan> = {
  1280: "monthly",
  10800: "yearly",
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** customer.subscription.updated fires for far more than plan/tier changes; only items moving counts as one. */
function isPlanChange(event: StripeEvent): boolean {
  return Boolean(event.data.previous_attributes && "items" in event.data.previous_attributes);
}

function planFromSubscriptionItems(object: Record<string, unknown>): Plan | undefined {
  const items = object.items as { data?: Array<{ price?: { recurring?: { interval?: string } } }> } | undefined;
  const interval = items?.data?.[0]?.price?.recurring?.interval;
  if (interval === "year") return "yearly";
  if (interval === "month") return "monthly";
  return undefined;
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

            const amountTotal = object.amount_total as number | null | undefined;
            const plan = amountTotal != null ? PLAN_BY_AMOUNT_TOTAL[amountTotal] : undefined;
            if (amountTotal != null && !plan) {
              console.error(`stripe webhook: unrecognized amount_total ${amountTotal}, plan left unset`);
            }

            await applyStripeWebhook(sql, {
              householdId,
              stripeEventId: event.id,
              type: "subscription_created",
              payload: {
                plan,
                stripeCustomerId: (object.customer as string | null | undefined) ?? undefined,
                stripeSubscriptionId: (object.subscription as string | null | undefined) ?? undefined,
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
              payload: { plan: planFromSubscriptionItems(object) },
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
