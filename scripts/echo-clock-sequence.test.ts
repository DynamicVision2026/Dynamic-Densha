import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { pendingMigrations } from "./migration-plan.mjs";
import { createTestClock } from "../src/lib/server/clock.ts";
import { getGradeParams } from "../src/lib/grade-params.ts";
import {
  emptyProgress,
  evaluateProgress,
  type ProgressState,
} from "../src/lib/progress-eval.ts";

/**
 * The engineering ticket's required Phase A test: the real evaluation engine
 * (evaluateProgress -- the exact function src/lib/server/progress-write.ts's
 * runSubmitPractice/runCompleteEncounter/runCompleteUnderstand call, injected
 * with the same Clock those functions take) driven through a real household
 * in a real PGlite database, across the 20h then 168h echo delays, in
 * milliseconds instead of eight real days.
 *
 * This does not call runSubmitPractice/runCompleteEncounter itself: those
 * live in a file full of "@/..." aliased imports that only Vite's bundler
 * can resolve, which is why every other DB-backed test in this suite (see
 * multi-child.test.ts, b1-surface-seen.test.ts) also stops at the engine +
 * raw SQL rather than importing src/lib/server/progress*.ts directly. What
 * matters for this ticket is proven regardless: the SAME engine function,
 * the SAME Clock abstraction, and a REAL row in a REAL database round-trip
 * cleanly across the whole delay sequence -- including the negative case a
 * countdown display could never catch.
 */

async function freshDb(): Promise<PGlite> {
  const pg = new PGlite();
  await pg.waitReady;
  await pg.exec(
    "create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())",
  );
  const entries = await readdir("migrations");
  for (const { name } of pendingMigrations(entries, [])) {
    await pg.exec(await readFile(`migrations/${name}`, "utf8"));
    await pg.query("insert into _migrations (name) values ($1)", [name]);
  }
  return pg;
}

async function seedHousehold(pg: PGlite, hh: string, userId: string) {
  await pg.query("insert into household (id) values ($1)", [hh]);
  await pg.query("insert into household_member (household_id, user_id, role) values ($1,$2,'owner')", [hh, userId]);
  await pg.query("insert into subscription (household_id, state) values ($1,'trial')", [hh]);
}

async function seedChild(pg: PGlite, id: string, hh: string, userId: string, name = "たろう") {
  await pg.query(
    "insert into children (id, user_id, household_id, name, grade) values ($1,$2,$3,$4,1)",
    [id, userId, hh, name],
  );
}

/** Same column set as saveProgress in progress-store.ts -- a real round trip. */
async function persist(pg: PGlite, userId: string, childId: string, s: ProgressState) {
  await pg.query(
    `insert into kanji_progress (
       user_id, child_id, kanji, status,
       lights_reading, lights_meaning, lights_shape,
       encounter_completed, understand_completed,
       almost_at, echo_due_at, perfect_at, echo_success_count
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     on conflict (child_id, kanji) do update set
       status = excluded.status,
       lights_reading = excluded.lights_reading,
       lights_meaning = excluded.lights_meaning,
       lights_shape = excluded.lights_shape,
       encounter_completed = excluded.encounter_completed,
       understand_completed = excluded.understand_completed,
       almost_at = excluded.almost_at,
       echo_due_at = excluded.echo_due_at,
       perfect_at = excluded.perfect_at,
       echo_success_count = excluded.echo_success_count`,
    [
      userId,
      childId,
      s.kanji,
      s.status,
      s.lights.reading,
      s.lights.meaning,
      s.lights.shape,
      s.encounterCompleted,
      s.understandCompleted,
      s.almostAt,
      s.echoDueAt,
      s.perfectAt,
      s.echoSuccessCount,
    ],
  );
}

async function reload(pg: PGlite, userId: string, childId: string, kanji: string): Promise<ProgressState> {
  const rows = await pg.query<Record<string, unknown>>(
    `select * from kanji_progress where user_id = $1 and child_id = $2 and kanji = $3`,
    [userId, childId, kanji],
  );
  const r = rows.rows[0];
  assert.ok(r, `no persisted row for ${kanji} -- the DB round trip is broken`);
  const iso = (v: unknown) => (v == null ? null : new Date(v as string | Date).toISOString());
  return {
    ...emptyProgress(kanji),
    status: r.status as ProgressState["status"],
    lights: {
      reading: Boolean(r.lights_reading),
      meaning: Boolean(r.lights_meaning),
      shape: Boolean(r.lights_shape),
    },
    encounterCompleted: Boolean(r.encounter_completed),
    understandCompleted: Boolean(r.understand_completed),
    almostAt: iso(r.almost_at),
    echoDueAt: iso(r.echo_due_at),
    perfectAt: iso(r.perfect_at),
    echoSuccessCount: Number(r.echo_success_count ?? 0),
  };
}

test("real household + child, driven through evaluateProgress with an injected Clock, round-tripped through real PGlite, across the 20h/168h echo delays", async () => {
  const pg = await freshDb();
  const userId = "user-clock-1";
  const childId = "child-clock-1";
  const kanji = "一";
  await seedHousehold(pg, "hh-clock-1", userId);
  await seedChild(pg, childId, "hh-clock-1", userId);

  const clock = createTestClock("2026-01-01T00:00:00.000Z");
  const params = getGradeParams(1);
  assert.equal(params.echo_delay_hours, 20);
  assert.equal(params.echo_second_delay_hours, 168);

  // Step 1: teach + pass all three kinds in the same session -> almost
  // (だいたい), never perfect same-session, echoDueAt set ~20h out.
  let s = emptyProgress(kanji);
  s = evaluateProgress(s, { type: "completeEncounter", nowIso: clock.now().toISOString() }, params);
  s = evaluateProgress(s, { type: "completeUnderstand", nowIso: clock.now().toISOString() }, params);
  for (const kind of ["reading", "meaning", "shape"] as const) {
    s = evaluateProgress(
      s,
      {
        type: "answer",
        kind,
        correct: true,
        isEcho: false,
        echoBatchDone: false,
        nowIso: clock.now().toISOString(),
        shapeAvailable: true,
        surfaceId: `${kanji}:solo`,
      },
      params,
    );
  }
  assert.equal(s.status, "almost", "だいたい after same-session lights, not before, not past it");
  assert.equal(s.echoSuccessCount, 0);
  assert.ok(s.echoDueAt, "echoDueAt must be set");
  const firstDue = s.echoDueAt!;
  assert.equal(
    Date.parse(firstDue) - clock.now().getTime(),
    20 * 3600_000,
    "first echo is due in exactly echo_delay_hours (20h), not some other number",
  );
  await persist(pg, userId, childId, s);

  // Step 5 (negative case, checked first: this is the failure a countdown
  // display can never catch): answering correctly BEFORE the due time must
  // not advance the echo count at all.
  let early = await reload(pg, userId, childId, kanji);
  clock.advanceHours(5); // still hours short of the 20h due time
  early = evaluateProgress(
    early,
    {
      type: "answer",
      kind: "reading",
      correct: true,
      isEcho: true,
      echoBatchDone: true,
      nowIso: clock.now().toISOString(),
      shapeAvailable: true,
      surfaceId: `${kanji}:solo`,
    },
    params,
  );
  assert.equal(early.status, "almost", "an early answer must not skip ahead");
  assert.equal(early.echoSuccessCount, 0, "an inverted due-comparison would increment this -- it must not");
  assert.equal(early.echoDueAt, firstDue, "the due time itself must not move on an early answer");
  // Do not persist `early` -- it represents a hypothetical branch the real
  // household did not take. Reload the step-1 row and continue from there.

  // Step 3: advance the clock past echo_delay_hours (~20h total from start).
  // Answer correctly -> still almost (not perfect yet), echoSuccessCount=1,
  // echoDueAt rescheduled to the SECOND delay (168h), not the first again.
  let mid = await reload(pg, userId, childId, kanji);
  clock.set(firstDue); // exactly due
  mid = evaluateProgress(
    mid,
    {
      type: "answer",
      kind: "reading",
      correct: true,
      isEcho: true,
      echoBatchDone: true,
      nowIso: clock.now().toISOString(),
      shapeAvailable: true,
      surfaceId: `${kanji}:solo`,
    },
    params,
  );
  assert.equal(mid.status, "almost", "first successful echo stays almost, never jumps to perfect");
  assert.equal(mid.echoSuccessCount, 1);
  assert.ok(mid.echoDueAt);
  const secondDue = mid.echoDueAt!;
  assert.equal(
    Date.parse(secondDue) - clock.now().getTime(),
    168 * 3600_000,
    "the second echo is due in exactly echo_second_delay_hours (168h), not 20h again",
  );
  await persist(pg, userId, childId, mid);

  // Step 4: advance past echo_second_delay_hours (~168h more). Answer
  // correctly -> perfect (かんぺき), echoDueAt cleared.
  let last = await reload(pg, userId, childId, kanji);
  assert.equal(last.status, "almost");
  assert.equal(last.echoSuccessCount, 1);
  clock.set(secondDue);
  last = evaluateProgress(
    last,
    {
      type: "answer",
      kind: "reading",
      correct: true,
      isEcho: true,
      echoBatchDone: true,
      nowIso: clock.now().toISOString(),
      shapeAvailable: true,
      surfaceId: `${kanji}:solo`,
    },
    params,
  );
  assert.equal(last.status, "perfect", "second spaced echo reaches perfect");
  assert.equal(last.echoSuccessCount, 2);
  assert.equal(last.echoDueAt, null, "no further echo is scheduled once perfect");
  await persist(pg, userId, childId, last);

  const final = await reload(pg, userId, childId, kanji);
  assert.equal(final.status, "perfect", "perfect survives the round trip through real PGlite");
  assert.equal(final.echoDueAt, null);

  // The whole sequence ran on a clock the test moved by hand, in one process
  // tick -- not eight real elapsed days.
});
