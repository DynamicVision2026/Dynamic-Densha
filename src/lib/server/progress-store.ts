import { getSql, type Sql } from "@/lib/db";
import { resolveHouseholdId } from "@/lib/server/household";
import { ChildAccessError, assertChildCanRide } from "@/lib/server/coverage";
import type { Grade } from "@/data/kyoiku";
import { getKanji } from "@/data/kyoiku";
import { getGradeParams, type GradeParams } from "@/lib/grade-params";
import { parseKinds } from "@/lib/mastery";
import { hydrateProgress, type ProgressState } from "@/lib/progress-eval";
import {
  backfillSurfaceSeenFromProgress,
  insertMissingSurfaceSeen,
  loadSurfaceSeenByKanji,
  parseStringList,
  unionSurfaceIds,
} from "@/lib/server/surface-seen";
import { justReachedPerfect, stampFromPerfect, type Stamp } from "@/lib/stamps";

/**
 * DB (de)serialization and load/save for one child's kanji_progress rows,
 * split out of progress.ts so the write path (progress-write.ts) can depend
 * on this without depending on any of progress.ts's read-only report/board
 * builders -- and so this file, like that one, never reads the system clock
 * directly (see check-clock-single-source.mjs).
 */

function asStatus(raw: string): ProgressState["status"] {
  if (raw === "lost" || raw === "fix" || raw === "almost" || raw === "perfect") return raw;
  return "new";
}

function asBool(v: unknown): boolean {
  return v === true || v === "t" || v === "true" || v === 1 || v === "1";
}

function parseCountMap(raw: unknown): ProgressState["wrongCountByKind"] {
  const zero = { reading: 0, meaning: 0, shape: 0 };
  if (!raw) return { ...zero };
  try {
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!v || typeof v !== "object") return { ...zero };
    const o = v as Record<string, unknown>;
    return {
      reading: Number(o.reading ?? 0) || 0,
      meaning: Number(o.meaning ?? 0) || 0,
      shape: Number(o.shape ?? 0) || 0,
    };
  } catch {
    return { ...zero };
  }
}

function parseLastSuccess(raw: unknown): ProgressState["lastSuccessByKind"] {
  if (!raw) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as ProgressState["lastSuccessByKind"];
  }
  try {
    const v = JSON.parse(String(raw));
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

function completedKindsOf(s: ProgressState): string {
  return (["reading", "meaning", "shape"] as const).filter((k) => s.lights[k]).join(",");
}

export function iso(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  const s = String(v);
  if (!s || s === "null") return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

export function rowToState(r: Record<string, unknown>): ProgressState {
  const kinds = parseKinds(String(r.completed_kinds ?? ""));
  return hydrateProgress({
    kanji: String(r.kanji),
    status: asStatus(String(r.status ?? "new")),
    lights: {
      reading: asBool(r.lights_reading) || kinds.includes("reading"),
      meaning: asBool(r.lights_meaning) || kinds.includes("meaning"),
      shape: asBool(r.lights_shape) || kinds.includes("shape"),
    },
    encounterCompleted: asBool(r.encounter_completed),
    understandCompleted: asBool(r.understand_completed),
    seenAt: iso(r.seen_at),
    lastPracticeAt: iso(r.last_practice_at),
    almostAt: iso(r.almost_at),
    echoDueAt: iso(r.echo_due_at),
    perfectAt: iso(r.perfect_at),
    correctStreakByKind: parseCountMap(r.correct_streak_by_kind),
    wrongCountByKind: parseCountMap(r.wrong_count_by_kind),
    consecutiveWrongByKind: parseCountMap(r.consecutive_wrong_by_kind),
    repairRequiredKinds: parseKinds(String(r.repair_required_kinds ?? "")),
    attempts: Number(r.attempts ?? 0),
    surfacesSeenSuccess: parseStringList(r.surfaces_seen_success),
    lastSuccessByKind: parseLastSuccess(r.last_success_by_kind),
    echoSuccessCount: Number(r.echo_success_count ?? 0) || 0,
  });
}

/** `char`'s own grade params, falling back to the child's profile grade. */
export function paramsForChar(char: string, fallback: Grade): GradeParams {
  return getGradeParams(getKanji(char)?.grade ?? fallback);
}

/**
 * Resolve the caller's household and refuse anything that is not theirs, or
 * that this child may not ride right now. One helper rather than three lines
 * repeated in four handlers -- the repeated version is how one of them ends
 * up missing the ownership half.
 */
export async function assertChildCanRideForCaller(userId: string, childId: string): Promise<void> {
  const sql = await getSql();
  const householdId = await resolveHouseholdId(sql, userId);
  await assertChildCanRide(sql, householdId, childId, new Date().toISOString(), userId);
}

export async function loadProgress(userId: string, childId: string, sqlClient?: Sql) {
  const sql = sqlClient ?? (await getSql());
  // Scoped to the caller's HOUSEHOLD, not to their user_id. The two are the
  // same for a single-parent household and diverge the moment a second
  // parent joins one -- at which point a user_id filter would hide a
  // co-parent's children from them. A cross-household id finds nothing and
  // raises the 404-shaped ChildAccessError, never a 403: see coverage.ts.
  const householdId = await resolveHouseholdId(sql, userId);
  // Same orphan fallback as listChildren: a null household_id is a row from a
  // deploy window, not a stranger's child. See server/children.ts's note.
  const owned = await sql<{ id: string; grade: number; name: string }>`
    select id, grade, name from children
    where id = ${childId} and archived_at is null
      and (household_id = ${householdId}
           or (household_id is null and user_id = ${userId}))
  `;
  const child = owned[0];
  if (!child) throw new ChildAccessError(404, "お子さまの情報が見つかりません");
  await backfillSurfaceSeenFromProgress(sql, userId, childId);
  const seenByKanji = await loadSurfaceSeenByKanji(sql, userId, childId);
  const rows = await sql.query<Record<string, unknown>>(
    `select * from kanji_progress where child_id = $1 and user_id = $2`,
    [childId, userId],
  );
  const map = new Map<string, ProgressState>();
  for (const r of rows) {
    const state = rowToState(r);
    state.surfacesSeenSuccess = unionSurfaceIds(
      state.surfacesSeenSuccess,
      seenByKanji.get(state.kanji) ?? [],
    );
    map.set(state.kanji, state);
  }
  return {
    child: { id: child.id, name: child.name, grade: child.grade as Grade },
    map,
  };
}

export async function saveProgress(
  userId: string,
  childId: string,
  state: ProgressState,
  sqlClient?: Sql,
) {
  const sql = sqlClient ?? (await getSql());
  const kinds = completedKindsOf(state);
  await sql.query(
    `insert into kanji_progress (
      user_id, child_id, kanji, status, correct_streak, attempts, wrong_count, completed_kinds,
      lights_reading, lights_meaning, lights_shape,
      encounter_completed, understand_completed,
      seen_at, last_practice_at, almost_at, echo_due_at, perfect_at,
      wrong_count_by_kind, correct_streak_by_kind, consecutive_wrong_by_kind,
      repair_required_kinds, surfaces_seen_success, last_success_by_kind, echo_success_count, updated_at
    ) values (
      $1,$2,$3,$4,$5,$6,$7,$8,
      $9,$10,$11,
      $12,$13,
      $14,$15,$16,$17,$18,
      $19,$20,$21,
      $22,$23,$24,$25, now()
    )
    on conflict (child_id, kanji)
    do update set
      status = excluded.status,
      correct_streak = excluded.correct_streak,
      attempts = excluded.attempts,
      wrong_count = excluded.wrong_count,
      completed_kinds = excluded.completed_kinds,
      lights_reading = excluded.lights_reading,
      lights_meaning = excluded.lights_meaning,
      lights_shape = excluded.lights_shape,
      encounter_completed = excluded.encounter_completed,
      understand_completed = excluded.understand_completed,
      seen_at = excluded.seen_at,
      last_practice_at = excluded.last_practice_at,
      almost_at = excluded.almost_at,
      echo_due_at = excluded.echo_due_at,
      perfect_at = excluded.perfect_at,
      wrong_count_by_kind = excluded.wrong_count_by_kind,
      correct_streak_by_kind = excluded.correct_streak_by_kind,
      consecutive_wrong_by_kind = excluded.consecutive_wrong_by_kind,
      repair_required_kinds = excluded.repair_required_kinds,
      surfaces_seen_success = excluded.surfaces_seen_success,
      last_success_by_kind = excluded.last_success_by_kind,
      echo_success_count = excluded.echo_success_count,
      updated_at = now()
    where kanji_progress.user_id = $1`,
    [
      userId,
      childId,
      state.kanji,
      state.status,
      state.correctStreakByKind.reading +
        state.correctStreakByKind.meaning +
        state.correctStreakByKind.shape,
      state.attempts,
      state.wrongCountByKind.reading +
        state.wrongCountByKind.meaning +
        state.wrongCountByKind.shape,
      kinds,
      state.lights.reading,
      state.lights.meaning,
      state.lights.shape,
      state.encounterCompleted,
      state.understandCompleted,
      state.seenAt,
      state.lastPracticeAt,
      state.almostAt,
      state.echoDueAt,
      state.perfectAt,
      JSON.stringify(state.wrongCountByKind),
      JSON.stringify(state.correctStreakByKind),
      JSON.stringify(state.consecutiveWrongByKind),
      state.repairRequiredKinds.join(","),
      JSON.stringify(state.surfacesSeenSuccess ?? []),
      JSON.stringify(state.lastSuccessByKind ?? {}),
      state.echoSuccessCount ?? 0,
    ],
  );
  await insertMissingSurfaceSeen(
    sql,
    userId,
    childId,
    state.kanji,
    state.surfacesSeenSuccess ?? [],
  );
}

export async function listStamps(userId: string, childId: string, sqlClient?: Sql): Promise<Stamp[]> {
  const sql = sqlClient ?? (await getSql());
  await sql`
    insert into child_stamps (user_id, child_id, kanji, perfect_at, line_ids)
    select user_id, child_id, kanji, coalesce(perfect_at, updated_at), '[]'
    from kanji_progress
    where user_id = ${userId}
      and child_id = ${childId}
      and (status = 'perfect' or perfect_at is not null)
    on conflict (child_id, kanji) do nothing
  `;
  const rows = await sql<{
    kanji: string;
    perfect_at: string | Date;
    line_ids: string;
  }>`
    select kanji, perfect_at, line_ids
    from child_stamps
    where user_id = ${userId} and child_id = ${childId}
    order by perfect_at desc
  `;
  return rows.map((r) => ({
    kanji: r.kanji,
    perfect_at: iso(r.perfect_at) ?? "",
    line_ids: parseStringList(r.line_ids),
  }));
}

export async function awardStamp(
  userId: string,
  childId: string,
  prev: ProgressState,
  next: ProgressState,
  sqlClient?: Sql,
) {
  if (!justReachedPerfect(prev, next)) return;
  const stamp = stampFromPerfect(next);
  const sql = sqlClient ?? (await getSql());
  await sql`
    insert into child_stamps (user_id, child_id, kanji, perfect_at, line_ids)
    values (
      ${userId}, ${childId}, ${stamp.kanji}, ${stamp.perfect_at}, ${JSON.stringify(stamp.line_ids ?? [])}
    )
    on conflict (child_id, kanji) do nothing
  `;
}
