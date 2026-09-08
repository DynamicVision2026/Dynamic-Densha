/**
 * Maps a Stripe Price id to this app's Plan. Driven entirely by
 * STRIPE_PRICE_MONTHLY_ID/STRIPE_PRICE_ANNUAL_ID -- no hardcoded price id or
 * amount anywhere in this file, on purpose.
 *
 * An earlier version of the webhook route matched on the checkout session's
 * amount_total (a hardcoded { 1280: "monthly", 10800: "yearly" } table).
 * That fails in the worst possible direction: if a price changes in the
 * Stripe Dashboard and nobody remembers to update the table in this
 * repository, amount_total matches nothing, the household's plan silently
 * comes back unset, and the household has already been charged by the time
 * anyone notices. The person changing a price in Stripe has no reason to
 * know a number in a TypeScript file governs entitlement. Price ids are
 * stable across amount changes and are already deploy-time config the same
 * way STRIPE_WEBHOOK_SECRET is, so there's nothing left to drift.
 *
 * Never guesses: an unrecognized price id (or a price id checked against an
 * unset env var) returns undefined rather than falling back to a default
 * plan. The caller (src/routes/api/webhooks/stripe.ts) is responsible for
 * logging that and leaving `plan` unset on the billing_event it records --
 * entitlement itself never depends on `plan` (see src/lib/entitlement.ts),
 * only on `state`, so an unresolved plan never blocks a household from
 * riding; it only means the plan label is unknown until someone notices the
 * log and fixes the env var.
 */
import type { Plan } from "./subscription-derive";

export type PricePlanEnv = {
  monthlyPriceId?: string;
  annualPriceId?: string;
};

function envFromProcess(): PricePlanEnv {
  if (typeof process === "undefined") return {};
  return {
    monthlyPriceId: process.env.STRIPE_PRICE_MONTHLY_ID,
    annualPriceId: process.env.STRIPE_PRICE_ANNUAL_ID,
  };
}

export function priceIdToPlan(priceId: string | null | undefined, env: PricePlanEnv = envFromProcess()): Plan | undefined {
  if (!priceId) return undefined;
  if (env.monthlyPriceId && priceId === env.monthlyPriceId) return "monthly";
  if (env.annualPriceId && priceId === env.annualPriceId) return "yearly";
  return undefined;
}
