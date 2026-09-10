-- Switch the payment processor from Stripe to Shopify Checkout.
--
-- Purely additive -- NOT a rename of the stripe_* columns 0011_stripe_
-- billing.sql added. This migration runs against Neon BEFORE the new
-- revision takes traffic (deploy-production.yml), while the PREVIOUS,
-- still-serving revision keeps running Stripe code against the OLD schema
-- for the rest of that window -- unlike 0011's shopify_*->stripe_* rename
-- (safe only because Shopify was never wired to a real endpoint at the
-- time), the Stripe webhook route being deleted in this same change IS live
-- and could receive a real delivery during that window. Renaming
-- subscription.stripe_customer_id/stripe_subscription_id or billing_event.
-- stripe_event_id out from under it would 500 that delivery. The old
-- stripe_* columns are simply left in place, unused once the Stripe route is
-- gone -- drop them in a later, separate migration once Stripe's own webhook
-- endpoint has been disabled and no further delivery could ever reach it.
alter table subscription add column if not exists shopify_customer_id text;
-- Shopify orders aren't subscriptions -- this caches the most recent paid
-- order's id (informational / support lookups only). Entitlement itself
-- resolves a household from every webhook event's own `kd_token` cart
-- attribute (src/routes/api/webhooks/shopify.ts), never from this column;
-- the one exception is refunds/create, whose payload is a Refund object with
-- no note_attributes of its own -- that handler falls back to matching
-- `order_id` against this column instead (see getHouseholdIdByShopifyOrderId
-- in src/lib/server/subscription.ts).
alter table subscription add column if not exists shopify_order_id text;

alter table billing_event add column if not exists shopify_event_id text;
-- Idempotency mechanism (spec unchanged from 0010/0011, just re-keyed):
-- X-Shopify-Webhook-Id is unique per delivery attempt, so a retried delivery
-- conflicts on insert here and is dropped before the fold ever sees it twice.
-- Deliberately NOT a partial index (no `where ... is not null`): standard
-- SQL/Postgres unique constraints already treat every NULL as distinct from
-- every other NULL, so old rows with a null shopify_event_id (this app's
-- entire pre-Shopify history, keyed on stripe_event_id instead) never
-- conflict with each other or with anything else -- a plain unique index
-- gets that for free. A partial index was tried first and reverted: Postgres
-- only uses a partial index to satisfy `ON CONFLICT (col)` inference when
-- the INSERT's own ON CONFLICT clause repeats that index's exact WHERE
-- predicate, which src/lib/server/webhooks.ts's plain
-- `on conflict (shopify_event_id) do nothing` doesn't -- confirmed by a real
-- functional smoke test against PGlite: "there is no unique or exclusion
-- constraint matching the ON CONFLICT specification" on the very first
-- orders/paid delivery. billing_event.stripe_event_id (0011) and the
-- original shopify_event_id (0010) both already used a plain unique index
-- for exactly this reason.
create unique index if not exists billing_event_shopify_event_id_idx
  on billing_event (shopify_event_id);

-- household.checkout_token (added in 0011_stripe_billing.sql) is reused
-- completely unchanged: a Shopify cart permalink now carries it as
-- ?attributes[kd_token]=<token>, the same opaque per-household id Stripe
-- Checkout carried as ?client_reference_id=<token>. Nothing to migrate.

comment on column subscription.paid_until is
  'NULL = permanent (buyout). Never backfill a date.';
