/**
 * Where /handoff sends a signed-in, entitled-to-subscribe household to
 * actually pay. Unlike the old Stripe Payment Link builder (checkout-link.ts,
 * deleted), Shopify has no server-side "create a checkout session, get back
 * a URL" call this app makes -- a Shopify cart PERMALINK
 * (https://{store}/cart/{variant}:1) IS the entire checkout URL on its own,
 * with ?attributes[...] query params carried straight through onto the
 * resulting order's note_attributes. That's how src/routes/api/webhooks/
 * shopify.ts later reads kd_token back out to resolve a household -- never
 * household_id or email, only the opaque checkout_token (see src/lib/server/
 * household.ts), matching Stripe Checkout's client_reference_id role in the
 * previous design.
 *
 * Server-only: SHOPIFY_STORE_DOMAIN/SHOPIFY_VARIANT_* are deploy-time env
 * vars read via `process.env`, the same way the deleted STRIPE_PRICE_* ids
 * were -- never bundled into client code.
 */
import type { Plan } from "./subscription-derive";

function env(key: string): string | undefined {
  if (typeof process === "undefined") return undefined;
  const value = process.env[key]?.trim();
  return value ? value : undefined;
}

/** The store domain /handoff shows the visitor before redirecting there. */
export function shopifyStoreDomain(): string {
  return env("SHOPIFY_STORE_DOMAIN") ?? "";
}

function variantIdFor(plan: Plan): string | undefined {
  return plan === "buyout" ? env("SHOPIFY_VARIANT_BUYOUT") : env("SHOPIFY_VARIANT_ANNUAL");
}

/**
 * Appends ?attributes[kd_token]=<token>&attributes[kd_plan]=<plan> to the
 * plan's cart permalink -- never a bare URL, and never household_id or a
 * parent's email in the cart attributes (spec invariant). Throws rather than
 * returning a broken link if the store domain or this plan's variant id
 * isn't configured -- /handoff's caller decides how to surface that instead
 * of silently sending a family to a 404.
 */
export function buildCheckoutUrl(plan: Plan, checkoutToken: string): string {
  const domain = shopifyStoreDomain();
  const variantId = variantIdFor(plan);
  if (!domain) throw new Error("shopify-checkout: SHOPIFY_STORE_DOMAIN is not configured");
  if (!variantId) {
    throw new Error(
      `shopify-checkout: no variant id configured for plan "${plan}" (SHOPIFY_VARIANT_${plan === "buyout" ? "BUYOUT" : "ANNUAL"})`,
    );
  }
  const url = new URL(`https://${domain}/cart/${variantId}:1`);
  url.searchParams.set("attributes[kd_token]", checkoutToken);
  url.searchParams.set("attributes[kd_plan]", plan);
  return url.toString();
}
