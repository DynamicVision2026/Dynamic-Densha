/**
 * Where the parent dashboard's subscribe buttons point. Unlike the old
 * Shopify-era subscribe-link.ts, this app now embeds the real Stripe
 * Payment Link URLs directly -- the previous design (linking out to
 * landingpage-densha's static pricing page) can't carry a per-household
 * client_reference_id, because that site is deliberately static/inert (no
 * session, no auth-aware content; see its own check-inert.mjs) and has no
 * way to know which household is asking. Only a page that already knows
 * who's logged in -- this dashboard -- can build a personalized link, so
 * that's what does it now.
 *
 * These two URLs are public by nature (they're the same links already live
 * on kanji-ai.jp/pricing.html) -- safe to hardcode, not a secret. Update
 * both here and on that page together if either plan's Payment Link ever
 * changes.
 */
const MONTHLY_PAYMENT_LINK = "https://buy.stripe.com/3cIcN44412R11BDfekenS00";
const YEARLY_PAYMENT_LINK = "https://buy.stripe.com/9B6aEWeIF0ITcgh9U0enS01";

/**
 * Appends ?client_reference_id=<token> to a Stripe Payment Link -- never a
 * bare URL. checkout.session.completed's own client_reference_id is how the
 * webhook (src/routes/api/webhooks/stripe.ts) maps a completed checkout back
 * to a household, so a link with no token attached can never grant
 * entitlement to anyone (see getHouseholdIdByCheckoutToken).
 */
function buildCheckoutUrl(paymentLink: string, checkoutToken: string): string {
  const url = new URL(paymentLink);
  url.searchParams.set("client_reference_id", checkoutToken);
  return url.toString();
}

export function monthlyCheckoutUrl(checkoutToken: string): string {
  return buildCheckoutUrl(MONTHLY_PAYMENT_LINK, checkoutToken);
}

export function yearlyCheckoutUrl(checkoutToken: string): string {
  return buildCheckoutUrl(YEARLY_PAYMENT_LINK, checkoutToken);
}
