-- Switch the payment processor from Shopify to Stripe.
--
-- allow-destructive: subscription.shopify_customer_id, subscription.
-- shopify_subscription_id, and billing_event.shopify_event_id (all added in
-- 0010_commerce.sql) are renamed to their stripe_* equivalents below.
-- Confirmed safe via a full-repo grep before writing this migration: none of
-- the three columns was ever read or written by any application code -- the
-- Shopify webhook intake in src/lib/server/webhooks.ts was never wired to a
-- real HTTP endpoint or a real Shopify account, so no currently-serving
-- revision references any of these names. There is no window during a
-- rolling deploy where old code could read a column that no longer exists.
-- This is the one exception to expand/contract in this migration; the
-- household.checkout_token addition below is purely additive.
--
-- billing_event's unique constraint on the renamed stripe_event_id column
-- (Postgres keeps a constraint attached across RENAME COLUMN) is what gives
-- webhook delivery its idempotency: a retried Stripe event conflicts on
-- insert and is dropped before subscription-derive.ts's fold ever sees it
-- twice -- same mechanism as before, just re-keyed to Stripe's event.id.
alter table subscription rename column shopify_customer_id to stripe_customer_id;
alter table subscription rename column shopify_subscription_id to stripe_subscription_id;
alter table billing_event rename column shopify_event_id to stripe_event_id;

-- Opaque per-household checkout token. Entitlement must never resolve by
-- email or expose a raw household_id in a client-facing link -- Stripe
-- Checkout's client_reference_id is the mechanism instead: the parent
-- dashboard appends ?client_reference_id=<this token> to a Payment Link, and
-- checkout.session.completed's client_reference_id is how the webhook maps
-- the completed checkout back to a household.
--
-- Nullable, no backfill here: existing households from 0010's migration-time
-- backfill predate this column and simply have a null token until the next
-- time src/lib/server/household.ts's getOrCreateCheckoutToken reads one and
-- lazily generates it. Generating one in SQL here would need pgcrypto's
-- gen_random_uuid(), a dependency this repo deliberately avoids -- ids are
-- always generated in app code via crypto.randomUUID() (see 0010_commerce.
-- sql's own header comment on this), never in a migration.
alter table household add column if not exists checkout_token text;
create unique index if not exists household_checkout_token_idx
  on household (checkout_token) where checkout_token is not null;
