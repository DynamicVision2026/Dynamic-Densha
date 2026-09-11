-- Repair: children left with a NULL household_id by the deploy window.
--
-- 0014 added the column and backfilled it, and src/lib/server/children.ts's
-- createChild writes it -- but those two things went live at different
-- moments. The production pipeline applies migrations BEFORE the new revision
-- takes traffic, on purpose, so the old revision keeps serving against the
-- new schema; in run 17 that gap was 3m42s (0014 applied 05:13:26, revision
-- promoted 05:17:08). Any child created in that window was written by the OLD
-- createChild, which did not know about household_id, so it landed NULL.
--
-- listChildren then scoped by household_id alone and those children became
-- invisible to their own family: /app/parent read zero children for a
-- household that has two, and sent the parent to /onboard.
--
-- Same statement as 0014's backfill, run again. It is idempotent -- it only
-- touches rows that disagree with household_member -- and re-running it is
-- the permanent repair. The runtime now ALSO heals these rows on sight (see
-- listChildren), so a future deploy window cannot make a family invisible
-- again; this migration exists so the repair does not wait for each family
-- to next open the app.
update children c
set household_id = m.household_id
from household_member m
where m.user_id = c.user_id
  and (c.household_id is null or c.household_id is distinct from m.household_id);
