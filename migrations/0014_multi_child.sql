-- Multi-child model: which child an annual pass covers, and a household
-- membership link that is actually live.
--
-- Three notes on how this differs from the ticket's SQL sketch, all because
-- the sketch described a schema this repo doesn't have:
--
--   * the table is `children` (plural) and every id column is `text`, not
--     `uuid` -- ids are generated in app code via crypto.randomUUID(), never
--     in SQL (see 0001_auth.sql's and 0010_commerce.sql's own headers). A
--     `uuid`-typed covered_child_id could not reference children(id) at all.
--   * `children.archived_at` already exists, added by 0013_child_lifecycle.
--     Re-declared with `if not exists` below so this file still reads as the
--     complete statement of what the multi-child model needs, and so it
--     applies cleanly to a database that somehow predates 0013.
--   * the ticket asks to change any ON DELETE CASCADE from children to
--     RESTRICT. There is none to change: 0013_child_lifecycle added the six
--     foreign keys (kanji_progress, practice_events, child_stamps,
--     grade_routes, inspections, surface_seen) with no ON DELETE clause at
--     all, i.e. NO ACTION -- deleting a referenced children row already
--     raises. NO ACTION and RESTRICT reject the same delete here (they
--     differ only in whether the check can be deferred, and none of these
--     is deferrable), and converting would mean dropping and re-adding six
--     constraints, which is exactly the destructive reshape the additive
--     gate exists to prevent. Verified by test, not by reading: see
--     scripts/multi-child.test.ts.

-- NULL = every child covered (trial, buyout).
-- Set   = only that child may ride (annual pass).
alter table household
  add column if not exists covered_child_id text references children(id),
  add column if not exists covered_assigned_at timestamptz;

comment on column household.covered_child_id is
  'NULL = all children covered (trial/buyout). Set = annual pass holder. Never backfill.';
comment on column household.covered_assigned_at is
  'When covered_child_id was last set. Gates the 30-day reassignment cooldown; NULL means the first assignment, which is exempt.';

-- Soft delete only. Progress rows are never removed. (Already added by
-- 0013_child_lifecycle -- see the header note.)
alter table children add column if not exists archived_at timestamptz;

-- children.household_id has existed since 0010_commerce but has been DEAD
-- since the day it was added: the only thing that ever wrote it was 0010's
-- own one-time backfill, and createChild has never set it. Every ownership
-- check in the app therefore keys off children.user_id instead, and the
-- admin dashboard had to join through household_member to count a
-- household's children at all.
--
-- The multi-child model makes that untenable -- covered_child_id lives on
-- household, so "does this child belong to this household" has to be one
-- comparison and not a join through a second table -- so this backfills the
-- column from the membership table and src/lib/server/children.ts now
-- writes it on every insert.
--
-- Not a `not null` constraint: adding one would rewrite the table and would
-- fail outright on any row this backfill can't resolve (a child whose
-- user_id has no household_member row -- impossible today, since
-- resolveHouseholdId runs before any child is created, but a NOT NULL is a
-- deploy-time bet that nothing anywhere has ever diverged). The application
-- treats a null household_id as "not mine" everywhere, which is the safe
-- direction: a row that somehow escapes this backfill becomes invisible,
-- not cross-household-readable.
update children c
set household_id = m.household_id
from household_member m
where m.user_id = c.user_id
  and (c.household_id is null or c.household_id is distinct from m.household_id);

-- The list every child-facing surface reads: this household's living
-- children. Partial, because archived rows are never listed and there is no
-- query that wants them mixed in.
create index if not exists children_household_active_idx
  on children (household_id) where archived_at is null;

-- covered_child_id is read on every entitlement check for an annual
-- household; this is the reverse lookup (which household does this child
-- hold the pass for), used when archiving a child to find out whether the
-- pass has to be cleared.
create index if not exists household_covered_child_idx
  on household (covered_child_id) where covered_child_id is not null;
