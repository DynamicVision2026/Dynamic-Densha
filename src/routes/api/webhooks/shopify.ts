/**
 * Shopify webhook endpoint. This is the ONE legitimate caller of
 * applyShopifyWebhook (src/lib/server/webhooks.ts) among all route files --
 * scripts/check-webhook-only-entitlement.mjs exempts exactly this path and
 * fails on every other one, so entitlement can only ever be granted here,
 * never by a return/redirect page a browser hits after checkout.
 *
 * Every household lookup below goes through either the order's own
 * `note_attributes.kd_token` (orders/paid, orders/cancelled -- the cart
 * permalink's ?attributes[kd_token]=<checkout_token>, see src/lib/shopify-
 * checkout.ts) or, for refunds/create (whose payload carries no
 * note_attributes of its own, only order_id), the shopify_order_id an
 * earlier orders/paid event already cached -- never by email, and never by
 * trusting a plain household_id a client could send.
 */
import { createFileRoute } from "@tanstack/react-router";
import { getSql, withTransaction } from "@/lib/db";
import { verifyShopifyWebhookSignature } from "@/lib/shopify-signature";
import { applyShopifyWebhook } from "@/lib/server/webhooks";
import { getHouseholdIdByCheckoutToken, getHouseholdOwnerEmail } from "@/lib/server/household";
import { getHouseholdIdByShopifyOrderId } from "@/lib/server/subscription";
import { variantIdToPlan } from "@/lib/shopify-plan";
import { WELCOME_EMAIL_ACCESS_URL } from "@/lib/commerce-copy";
import { SUPPORT_EMAIL } from "@/lib/refund-contact";
import { buildDenshaWelcomeEmail, planNoteFor } from "@/lib/email/densha-welcome-email";
import { shouldSendWelcomeEmail } from "@/lib/email/welcome-email-decision";
import { buildEmailSender } from "@/lib/email/resend-sender";
import { alertFounder } from "@/lib/email/alert";
import type { EmailSender } from "@/lib/email/sender";
import type { Plan } from "@/lib/subscription-derive";

type ShopifyOrder = {
  id: number | string;
  /** e.g. "#1007" -- shown in the welcome email as the order reference. */
  name?: string;
  created_at?: string;
  note_attributes?: Array<{ name?: string; value?: string }>;
  line_items?: Array<{ variant_id?: number | string | null; title?: string; quantity?: number }>;
  customer?: { id?: number | string } | null;
};

type Sql = Awaited<ReturnType<typeof getSql>>;

/**
 * Sends the welcome email for a newly-paid, plan-recognized order, after
 * applyShopifyWebhook's own transaction has already committed entitlement.
 * Never throws -- a failure here must never fail the webhook response or
 * retrigger a Shopify retry (which would re-run entitlement logic for no
 * reason, since that's already idempotent, but would never get a second
 * chance at the email either way: a replay never re-sends, by design).
 */
async function sendDenshaWelcomeEmail(
  sql: Sql,
  sender: EmailSender,
  input: { householdId: string; order: ShopifyOrder; plan: Plan },
): Promise<void> {
  const orderRef = input.order.name ?? `#${String(input.order.id)}`;
  try {
    const owner = await getHouseholdOwnerEmail(sql, input.householdId);
    if (!owner) {
      console.error(`shopify webhook (orders/paid): order ${orderRef} entitled household ${input.householdId} has no resolvable owner email`);
      await alertFounder(sender, "owner-email-missing", { orderRef, householdId: input.householdId });
      return;
    }

    const items = (input.order.line_items ?? [])
      .filter((li) => li.variant_id != null && variantIdToPlan(li.variant_id) !== undefined)
      .map((li) => ({ title: li.title ?? "漢字でんしゃ", quantity: li.quantity ?? 1 }));

    const message = buildDenshaWelcomeEmail({
      to: owner.email,
      customerName: owner.name,
      orderRef,
      items: items.length > 0 ? items : [{ title: "漢字でんしゃ", quantity: 1 }],
      planNote: planNoteFor(input.plan),
      accessUrl: WELCOME_EMAIL_ACCESS_URL,
      supportEmail: SUPPORT_EMAIL,
    });
    await sender.send(message);
  } catch (err) {
    console.error(`shopify webhook (orders/paid): welcome email send failed for order ${orderRef}: ${err instanceof Error ? err.message : String(err)}`);
    await alertFounder(sender, "send-failed", { orderRef, householdId: input.householdId });
  }
}

type ShopifyRefund = {
  id: number | string;
  order_id?: number | string;
  created_at?: string;
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function noteAttribute(order: ShopifyOrder, name: string): string | undefined {
  return order.note_attributes?.find((a) => a.name === name)?.value;
}

/**
 * `event.created_at`, never `new Date()` at the time this route happens to
 * process the delivery (spec: paid_until math must be reproducible from the
 * stored event, not from whenever a retry happened to land). Only falls
 * back to receipt time if the payload is missing it entirely, which real
 * Shopify deliveries never do -- logged loudly if it ever happens, since it
 * would mean this route stopped matching Shopify's actual payload shape.
 */
function eventReceivedAt(payload: { created_at?: string }): string {
  if (payload.created_at && !Number.isNaN(Date.parse(payload.created_at))) return payload.created_at;
  console.error("shopify webhook: payload has no valid created_at, falling back to receipt time");
  return new Date().toISOString();
}

export const Route = createFileRoute("/api/webhooks/shopify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = typeof process !== "undefined" ? process.env.SHOPIFY_WEBHOOK_SECRET : undefined;
        if (!secret) {
          // Fail closed, the same way scripts/migrate.mjs refuses without
          // DATABASE_URL rather than silently skipping -- an unset secret
          // must never be read as "accept everything unverified."
          console.error("shopify webhook: SHOPIFY_WEBHOOK_SECRET is not configured, refusing all deliveries");
          return json(500, { error: "webhook not configured" });
        }

        const rawBody = await request.text();
        const hmacHeader = request.headers.get("x-shopify-hmac-sha256") ?? "";
        if (!verifyShopifyWebhookSignature(rawBody, hmacHeader, secret)) {
          return json(401, { error: "invalid signature" });
        }

        // Shopify's own idempotency key -- unique per delivery attempt,
        // unlike anything in the JSON body itself. Refuse rather than accept
        // a delivery this route couldn't de-duplicate against a retry.
        const webhookId = request.headers.get("x-shopify-webhook-id");
        if (!webhookId) {
          console.error("shopify webhook: missing X-Shopify-Webhook-Id header, refusing");
          return json(400, { error: "missing webhook id" });
        }

        const topic = request.headers.get("x-shopify-topic") ?? "";

        let payload: Record<string, unknown>;
        try {
          payload = JSON.parse(rawBody);
        } catch {
          return json(400, { error: "invalid JSON" });
        }

        const sql = await getSql();
        const emailSender = buildEmailSender();

        switch (topic) {
          case "orders/paid":
          case "orders/cancelled": {
            const order = payload as ShopifyOrder;
            const token = noteAttribute(order, "kd_token");
            const orderRef = order.name ?? `#${String(order.id)}`;

            // Computed before the token/household checks below (never gating
            // entitlement itself -- that logic is unchanged) so an alert can
            // distinguish "a recognized Densha variant with nothing to
            // resolve it to" from "genuinely another brand's order", which
            // look identical from token-presence alone.
            const variantId = topic === "orders/paid" ? (order.line_items?.[0]?.variant_id ?? null) : null;
            const plan = topic === "orders/paid" ? variantIdToPlan(variantId) : undefined;

            if (!token) {
              if (topic === "orders/paid" && plan) {
                console.error(`shopify webhook (orders/paid): order ${orderRef} matches plan "${plan}" but carries no kd_token`);
                await alertFounder(emailSender, "kd_token-missing", { orderRef, plan });
              }
              return json(200, { ok: true, skipped: "unattributed" });
            }

            const householdId = await getHouseholdIdByCheckoutToken(sql, token);
            if (!householdId) {
              if (topic === "orders/paid") {
                console.error(`shopify webhook (orders/paid): order ${orderRef} carries a kd_token that resolves no household`);
                await alertFounder(emailSender, "household-unresolved", { orderRef });
              }
              return json(200, { ok: true, skipped: "unattributed" });
            }

            const shopifyOrderId = String(order.id);
            const shopifyCustomerId = order.customer?.id != null ? String(order.customer.id) : undefined;
            const eventPayload: Record<string, unknown> = { shopifyOrderId, shopifyCustomerId, raw: payload };

            if (topic === "orders/paid") {
              if (!plan) {
                console.error(
                  `shopify webhook (orders/paid): variant id ${String(variantId)} matches neither ` +
                    `SHOPIFY_VARIANT_BUYOUT nor SHOPIFY_VARIANT_ANNUAL -- plan left unset`,
                );
                eventPayload.planUnset = true;
              } else {
                eventPayload.plan = plan;
              }
            }

            // In a transaction so applyShopifyWebhook's advisory lock is
            // transaction-scoped and actually holds: on the pooled client it
            // would be taken on one connection and the insert+recompute done
            // on others, which is a lock that blocks nobody.
            const { wasNewDelivery } = await withTransaction((tx) =>
              applyShopifyWebhook(tx, {
                householdId,
                shopifyEventId: webhookId,
                type: topic === "orders/paid" ? "order_paid" : "order_cancelled",
                payload: eventPayload,
                receivedAt: eventReceivedAt(order),
              }),
            );

            // After the transaction commits, never inside it: a slow email
            // provider must not hold the advisory lock or the DB connection,
            // and this step is additive to entitlement, never a precondition
            // for it (same reasoning as refunds/create sending no letter --
            // money/access decisions and the welcome email are independent).
            if (shouldSendWelcomeEmail({ topic, wasNewDelivery, plan })) {
              await sendDenshaWelcomeEmail(sql, emailSender, { householdId, order, plan: plan! });
            }

            return json(200, { ok: true });
          }

          case "refunds/create": {
            const refund = payload as ShopifyRefund;
            const orderId = refund.order_id != null ? String(refund.order_id) : undefined;
            const householdId = await getHouseholdIdByShopifyOrderId(sql, orderId);
            if (!householdId) return json(200, { ok: true, skipped: "unattributed" });

            await withTransaction((tx) =>
              applyShopifyWebhook(tx, {
                householdId,
                shopifyEventId: webhookId,
                type: "refund",
                payload: { shopifyOrderId: orderId, raw: payload },
                receivedAt: eventReceivedAt(refund),
              }),
            );
            return json(200, { ok: true });
          }

          default:
            return json(200, { ok: true, skipped: `unhandled topic: ${topic}` });
        }
      },
    },
  },
});
