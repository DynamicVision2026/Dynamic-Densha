/**
 * Maps a Shopify variant id to this app's Plan. Driven entirely by
 * SHOPIFY_VARIANT_BUYOUT/SHOPIFY_VARIANT_ANNUAL -- no hardcoded variant id
 * or amount anywhere in this file, on purpose (see stripe-plan.ts's own
 * header comment, deleted alongside it, for why matching on amount is the
 * wrong failure mode: a price changed in Shopify with nobody remembering to
 * update a hardcoded table here silently strands the household unplanned
 * instead of unentitled -- see the "plan left unset" handling below and in
 * src/routes/api/webhooks/shopify.ts).
 *
 * Shopify's webhook payload carries `line_items[*].variant_id` as a JSON
 * number, while the env vars (and any id a human pastes into Cloud Run) are
 * strings -- comparison here is string-normalized on both sides so `50476993282296`
 * (number) and `"50476993282296"` (env var) compare equal.
 *
 * Never guesses: an unrecognized variant id (or one checked against an unset
 * env var) returns undefined rather than falling back to a default plan --
 * entitlement itself never depends on `plan` (see src/lib/entitlement.ts),
 * only on `state`, so an unresolved plan never blocks a household from
 * riding; it only means the plan label is unknown until someone notices the
 * log and fixes the env var.
 */
import type { Plan } from "./subscription-derive";

export type VariantPlanEnv = {
  buyoutVariantId?: string;
  annualVariantId?: string;
};

function envFromProcess(): VariantPlanEnv {
  if (typeof process === "undefined") return {};
  return {
    buyoutVariantId: process.env.SHOPIFY_VARIANT_BUYOUT,
    annualVariantId: process.env.SHOPIFY_VARIANT_ANNUAL,
  };
}

export function variantIdToPlan(
  variantId: string | number | null | undefined,
  env: VariantPlanEnv = envFromProcess(),
): Plan | undefined {
  if (variantId === null || variantId === undefined || variantId === "") return undefined;
  const id = String(variantId);
  if (env.buyoutVariantId && id === env.buyoutVariantId) return "buyout";
  if (env.annualVariantId && id === env.annualVariantId) return "annual";
  return undefined;
}
