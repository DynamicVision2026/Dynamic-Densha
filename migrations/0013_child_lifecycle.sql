-- Child profile idempotency + lifecycle (architect-flagged): a one-time,
-- safe cleanup of exact-name duplicate children within one household, plus
-- the schema this app needs so the same duplication can't recur and so a
-- parent can rename or soft-hide a profile without destroying progress.
--
-- allow-destructive: the dedup routine below does contain `delete from`
-- statements, but each one only ever fires after this same routine has
-- verified, immediately beforehand, that the specific row has zero rows in
-- every table that hangs off a child_id -- i.e. it only ever removes a
-- true orphan duplicate (the known case: a zero-progress "Brian2023" row
-- created by a double form submit), never a profile with any history. The
-- still-serving previous revision reads children by id from a session's
-- own active-child selection; the one row this could ever remove has no
-- progress for that revision to have meaningfully been showing anyway.
--
-- household_member is keyed one row per user_id (see 0010_commerce.sql's
-- household_member_user_idx unique index) -- a duplicate CHILD within one
-- household never implies a duplicate household_member row, since both
-- duplicate children already share the one owner/user_id that row belongs
-- to. So the cleanup below only ever touches `children` and the tables
-- that hang off a child_id; there is no separate household_member row to
-- remove for this case.

alter table children add column if not exists archived_at timestamptz;
alter table children add column if not exists idempotency_key text;

-- A retry of the exact same create-child submission (double-tap, or a
-- client retry after a dropped response -- see src/lib/server/children.ts)
-- carries the same client-generated idempotency_key and upserts onto the
-- same row instead of creating a second one. Deliberately NOT a partial
-- index (no `where idempotency_key is not null`): standard SQL/Postgres
-- unique constraints already treat every NULL as distinct from every other
-- NULL, so every child created before this migration -- which has no key
-- at all -- never collides with itself or with anything else, for free.
-- A partial index was tried first and reverted here too (see
-- 0012_shopify_checkout.sql's billing_event_shopify_event_id_idx comment
-- for the exact same lesson, the first time this app hit it): Postgres
-- only uses a partial index to satisfy `ON CONFLICT (col1, col2)`
-- inference when the INSERT's own ON CONFLICT clause repeats that index's
-- exact WHERE predicate, which src/lib/server/children.ts's plain
-- `on conflict (user_id, idempotency_key) do nothing` doesn't -- confirmed
-- by a real functional test: "there is no unique or exclusion constraint
-- matching the ON CONFLICT specification" (scripts/child-lifecycle.test.ts).
create unique index if not exists children_user_idempotency_idx
  on children (user_id, idempotency_key);

-- One-time cleanup of exact-name duplicate children within a household
-- (the known case: two "Brian2023" rows in the admin's own test household
-- from a double form submit, before idempotency_key existed to prevent
-- it). Never guesses when it isn't sure -- a group is only ever touched
-- when the keep/remove decision is unambiguous:
--   - exactly one row in the group has ANY progress, across every table
--     that hangs off a child_id (kanji_progress, practice_events,
--     child_stamps, grade_routes, inspections, surface_seen) -> keep it,
--     remove the rest (each re-verified at zero progress immediately
--     before its own deletion)
--   - every row in the group has zero progress everywhere -> keep the
--     oldest (created_at), remove the rest (same zero-progress reverify)
--   - anything else (more than one row in the group has progress) ->
--     touch nothing at all for that group, just RAISE NOTICE so a human
--     decides -- this is the "ensure deletion fails safely rather than
--     silently cascading progress destruction" requirement in practice:
--     the routine's own answer to "am I sure" is "no" here, so it does
--     nothing rather than pick a side.
do $$
declare
  grp record;
  c record;
  progressed_id text;
  progressed_count integer;
  oldest_id text;
  keep_id text;
  cnt integer;
begin
  for grp in
    select user_id, name
    from children
    where archived_at is null
    group by user_id, name
    having count(*) > 1
  loop
    progressed_id := null;
    progressed_count := 0;
    oldest_id := null;

    for c in
      select id from children
      where user_id = grp.user_id and name = grp.name and archived_at is null
      order by created_at asc
    loop
      if oldest_id is null then
        oldest_id := c.id;
      end if;

      select
        (select count(*) from kanji_progress where child_id = c.id)
        + (select count(*) from practice_events where child_id = c.id)
        + (select count(*) from child_stamps where child_id = c.id)
        + (select count(*) from grade_routes where child_id = c.id)
        + (select count(*) from inspections where child_id = c.id)
        + (select count(*) from surface_seen where child_id = c.id)
      into cnt;

      if cnt > 0 then
        progressed_count := progressed_count + 1;
        progressed_id := c.id;
      end if;
    end loop;

    if progressed_count = 1 then
      keep_id := progressed_id;
    elsif progressed_count = 0 then
      keep_id := oldest_id;
    else
      raise notice 'child-dedup: skipping user_id=% name=% -- % rows have progress, ambiguous, needs manual review',
        grp.user_id, grp.name, progressed_count;
      continue;
    end if;

    for c in
      select id from children
      where user_id = grp.user_id and name = grp.name and archived_at is null and id <> keep_id
    loop
      -- Re-verify zero progress immediately before deleting -- belt and
      -- braces, since this is the one statement in the whole routine that
      -- destroys a row.
      select
        (select count(*) from kanji_progress where child_id = c.id)
        + (select count(*) from practice_events where child_id = c.id)
        + (select count(*) from child_stamps where child_id = c.id)
        + (select count(*) from grade_routes where child_id = c.id)
        + (select count(*) from inspections where child_id = c.id)
        + (select count(*) from surface_seen where child_id = c.id)
      into cnt;

      if cnt > 0 then
        raise notice 'child-dedup: refusing to delete child_id=% (user_id=% name=%) -- unexpectedly has % progress row(s)',
          c.id, grp.user_id, grp.name, cnt;
        continue;
      end if;

      delete from kanji_progress where child_id = c.id;
      delete from practice_events where child_id = c.id;
      delete from child_stamps where child_id = c.id;
      delete from grade_routes where child_id = c.id;
      delete from inspections where child_id = c.id;
      delete from surface_seen where child_id = c.id;
      delete from children where id = c.id;
      raise notice 'child-dedup: removed orphan duplicate child_id=% (user_id=% name=%), kept child_id=%',
        c.id, grp.user_id, grp.name, keep_id;
    end loop;
  end loop;
end $$;

-- Every future deletion of a children row must fail loudly, not silently
-- orphan (or, with an ON DELETE CASCADE this app has never asked for,
-- silently destroy) a family's progress. NOT VALID: this app has never had
-- these constraints, so any pre-existing orphaned progress row from some
-- unrelated, much earlier cause must not fail this migration outright --
-- the constraint still fully enforces against every new insert/update AND
-- against deleting a referenced children row from this point on (Postgres
-- checks that regardless of NOT VALID); only the one-time scan validating
-- already-existing rows is deferred. Run `VALIDATE CONSTRAINT` by hand
-- later once any pre-existing orphans (if any) are confirmed a non-issue.
alter table kanji_progress
  add constraint kanji_progress_child_id_fkey
  foreign key (child_id) references children(id) not valid;
alter table practice_events
  add constraint practice_events_child_id_fkey
  foreign key (child_id) references children(id) not valid;
alter table child_stamps
  add constraint child_stamps_child_id_fkey
  foreign key (child_id) references children(id) not valid;
alter table grade_routes
  add constraint grade_routes_child_id_fkey
  foreign key (child_id) references children(id) not valid;
alter table inspections
  add constraint inspections_child_id_fkey
  foreign key (child_id) references children(id) not valid;
alter table surface_seen
  add constraint surface_seen_child_id_fkey
  foreign key (child_id) references children(id) not valid;
