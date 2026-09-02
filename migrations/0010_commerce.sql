-- Commerce module v2.0/v2.1: household is the unit of subscription, trial,
-- and entitlement (spec §2, §7). IDs are TEXT, app-generated via
-- crypto.randomUUID() -- matching this repo's existing convention (see
-- 0001_auth.sql's own header comment against native uuid-typed columns, and
-- every existing id column in 0002_kanji.sql), not the native `uuid` type
-- the spec document's SQL sketch used.

create table if not exists household (
  id text primary key,
  created_at timestamptz not null default now()
);

-- A user belongs to exactly one household at a time -- created once, at
-- first parent-account creation, never merged or split by any automated
-- process (spec §2). The unique index on user_id is what makes "exactly
-- one" true; resolveHouseholdId() relies on it.
create table if not exists household_member (
  household_id text not null references household(id),
  user_id text not null,
  role text not null default 'owner',   -- owner | member
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);
create unique index if not exists household_member_user_idx on household_member (user_id);

-- DERIVED (spec §7.1). Nothing writes here directly -- not webhooks, not
-- admins, not migrations after this backfill. State and dates are computed
-- from billing_event + admin_action by src/lib/server/subscription.ts; this
-- table is the last-computed cache of that derivation, not a source of truth.
create table if not exists subscription (
  household_id text primary key references household(id),
  state text not null default 'guest',      -- guest|trial|active|lapsed|cancelled
  trial_ends_at timestamptz,                 -- written once, at household creation
  paid_until timestamptz,
  plan text,                                 -- monthly|yearly
  shopify_customer_id text,
  shopify_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Append-only audit trail. shopify_event_id's uniqueness IS the idempotency
-- mechanism (spec §6.3/§7) -- a retried webhook delivery conflicts here and
-- is dropped before it can double-apply anything.
create table if not exists billing_event (
  id text primary key,
  household_id text not null references household(id),
  shopify_event_id text unique,
  type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now()
);
create index if not exists billing_event_household_idx on billing_event (household_id, received_at desc);

-- Append-only, every manual intervention (spec §8). An admin extension is
-- part of the derivation (see subscription's comment above), which is why it
-- survives the next webhook recompute instead of being silently reverted.
create table if not exists admin_action (
  id text primary key,
  household_id text not null references household(id),
  type text not null,          -- trial_extended | note
  days integer,
  reason text not null,
  actor text not null,
  created_at timestamptz not null default now()
);
create index if not exists admin_action_household_idx on admin_action (household_id, created_at desc);

-- Survives household deletion (spec §2.2). email_hash, never plaintext --
-- this table outlives accounts and must not become a readable list of
-- former customers.
create table if not exists trial_spent (
  email_hash text primary key,
  first_used_at timestamptz not null default now()
);

alter table children add column if not exists household_id text;
create index if not exists children_household_idx on children (household_id);

-- Backfill: every existing user with at least one child profile gets a
-- household of their own, so nothing pre-existing breaks. This project has
-- no real paying users yet (pre-launch throughout this whole build), so a
-- fresh 10-day trial on migration is the honest, harmless choice here --
-- this is not a template for a real post-launch grandfather migration.
-- Deterministic id from user_id, not gen_random_uuid(): this repo has no
-- pgcrypto dependency anywhere (ids are generated in app code via
-- crypto.randomUUID(), never in SQL), and a migration is the wrong place to
-- introduce one. Collision-free since user_id is already unique per row.
do $$
declare
  u record;
  hh_id text;
begin
  for u in
    select distinct user_id from children where household_id is null
  loop
    hh_id := 'hh_' || u.user_id;
    insert into household (id) values (hh_id);
    insert into household_member (household_id, user_id, role)
    values (hh_id, u.user_id, 'owner')
    on conflict (user_id) do nothing;
    insert into subscription (household_id, state, trial_ends_at)
    values (hh_id, 'trial', now() + interval '10 days')
    on conflict (household_id) do nothing;
    update children set household_id = hh_id where user_id = u.user_id and household_id is null;
  end loop;
end $$;
