import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import type { Grade } from "@/data/kyoiku";
import { getKanji } from "@/data/kyoiku";
import { decorateTrains, type TrainView } from "@/lib/trains";
import { parseKinds, type MasteryStatus, type PracticeKind } from "@/lib/mastery";
import { getGradeParams } from "@/lib/grade-params";
import { parseGrade } from "@/lib/grade-nav";
import {
  echoAvailable,
  echoIsDue,
  emptyProgress,
  evaluateProgress,
  hydrateProgress,
  utcDay,
  type ProgressState,
} from "@/lib/progress-eval";
import { getItem, gradeChoice, shapeSurfaceAvailable } from "@/lib/items";
import { mapLinesFor } from "@/lib/lines";
import { justReachedPerfect, stampFromPerfect, type Stamp } from "@/lib/stamps";
import { buildParentReport, type ReportEvent } from "@/lib/parent-report";
import { pickWeekPeek } from "@/lib/week-peek";
import { buildDepartureBoard } from "@/lib/departure-board";
import { buildForwardMetrics } from "@/lib/parent-forward";
import { buildProjectedArrival } from "@/lib/projected-arrival";
import { canAdvanceGrade, shouldShowAprilPrompt } from "@/lib/grade-rollover";
import { buildWeeklyPlan } from "@/lib/weekly-plan";
import { buildGradeRings } from "@/lib/train-overview";
import {
  ensureChildPlan,
  listChildRoutes,
  loadChildRoute,
  loadInspections,
  maybeRecordInspection,
} from "@/lib/server/grade-route";

export type { TrainView } from "@/lib/trains";
export type { ProgressState } from "@/lib/progress-eval";

function asStatus(raw: string): MasteryStatus {
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

function parseStringList(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  try {
    const v = JSON.parse(String(raw));
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return String(raw)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
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

function iso(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  const s = String(v);
  if (!s || s === "null") return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

function rowToState(r: Record<string, unknown>): ProgressState {
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

export async function loadProgress(userId: string, childId: string) {
  const sql = await getSql();
  const owned = await sql<{ id: string; grade: number; name: string }>`
    select id, grade, name from children
    where id = ${childId} and user_id = ${userId}
  `;
  const child = owned[0];
  if (!child) throw new Error("こどもが見つかりません");
  const rows = await sql.query<Record<string, unknown>>(
    `select * from kanji_progress where child_id = $1 and user_id = $2`,
    [childId, userId],
  );
  const map = new Map<string, ProgressState>();
  for (const r of rows) {
    const state = rowToState(r);
    map.set(state.kanji, state);
  }
  return {
    child: { id: child.id, name: child.name, grade: child.grade as Grade },
    map,
  };
}

async function saveProgress(userId: string, childId: string, state: ProgressState) {
  const sql = await getSql();
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
}

async function listStamps(userId: string, childId: string): Promise<Stamp[]> {
  const sql = await getSql();
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

async function awardStamp(userId: string, childId: string, prev: ProgressState, next: ProgressState) {
  if (!justReachedPerfect(prev, next)) return;
  const stamp = stampFromPerfect(next);
  const sql = await getSql();
  await sql`
    insert into child_stamps (user_id, child_id, kanji, perfect_at, line_ids)
    values (
      ${userId}, ${childId}, ${stamp.kanji}, ${stamp.perfect_at}, ${JSON.stringify(stamp.line_ids ?? [])}
    )
    on conflict (child_id, kanji) do nothing
  `;
}

async function echoStartsToday(userId: string, childId: string, nowIso: string) {
  const sql = await getSql();
  const day = utcDay(nowIso);
  const rows = await sql<{ n: number }>`
    select count(distinct session_id)::int as n
    from practice_events
    where user_id = ${userId}
      and child_id = ${childId}
      and is_echo = true
      and created_at >= ${`${day}T00:00:00.000Z`}::timestamptz
  `;
  return Number(rows[0]?.n ?? 0);
}

function paramsForChar(char: string, fallback: Grade) {
  return getGradeParams(getKanji(char)?.grade ?? fallback);
}

export const getHomeState = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { childId: string; grade?: number }) => input)
  .handler(async ({ context, data }) => {
    const { child, map } = await loadProgress(context.userId, data.childId);
    const now = new Date().toISOString();
    const viewGrade = parseGrade(data.grade) ?? child.grade;
    const p = getGradeParams(child.grade);
    const started = await echoStartsToday(context.userId, data.childId, now);
    const trains = decorateTrains(viewGrade, map).map((t) => ({
      ...t,
      cars: t.cars.map((car) => ({
        ...car,
        echoDue: echoIsDue(map.get(car.char) ?? emptyProgress(car.char), now),
        echoDueAt: (map.get(car.char) ?? emptyProgress(car.char)).echoDueAt,
      })),
    }));
    const total = trains.reduce((n, t) => n + t.cars.length, 0);
    const gradeChars = new Set(trains.flatMap((t) => t.chars));
    const perfect = [...map.values()].filter(
      (row) => row.status === "perfect" && gradeChars.has(row.kanji),
    ).length;
    const echoQueue = [...map.values()]
      .filter((row) => echoAvailable(row, now, started, p))
      .slice(0, Math.max(0, p.echo_per_day_cap - started));
    const seenToday = [...map.values()].filter(
      (row) => row.seenAt && utcDay(row.seenAt) === utcDay(now),
    ).length;
    const routeRow = await loadChildRoute(context.userId, data.childId);
    const ensured = await ensureChildPlan(context.userId, routeRow, map, now);
    const inspections = await loadInspections(context.userId, data.childId);
    const weekly = buildWeeklyPlan({
      route: ensured.route,
      plan: ensured.plan,
      progress: map,
      inspections,
      weeklyNewCap: routeRow.weeklyNewCap,
      nowIso: now,
    });
    const board =
      viewGrade === child.grade
        ? buildDepartureBoard({ progress: map, inspections, plan: weekly, nowIso: now })
        : null;
    const rings = buildGradeRings({ progress: map, profileGrade: child.grade });
    return {
      child,
      viewGrade,
      trains,
      total,
      perfect,
      echoQueue: viewGrade === child.grade ? echoQueue : [],
      seenToday,
      maxNew: p.max_new_per_day,
      peek: pickWeekPeek({ progress: map, grade: viewGrade }),
      board,
      rings,
    };
  });

export const getKanjiStudy = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { childId: string; char: string }) => input)
  .handler(async ({ context, data }) => {
    const { child, map } = await loadProgress(context.userId, data.childId);
    const now = new Date().toISOString();
    const p = paramsForChar(data.char, child.grade);
    const started = await echoStartsToday(context.userId, data.childId, now);
    const progress = map.get(data.char) ?? emptyProgress(data.char);
    const charGrade = (getKanji(data.char)?.grade ?? child.grade) as Grade;
    const rings = buildGradeRings({ progress: map, profileGrade: child.grade });
    return {
      child,
      progress,
      unlocked: true,
      echoOn: echoAvailable(progress, now, started, p),
      gradePerfect: rings.find((r) => r.grade === charGrade)?.perfect ?? 0,
    };
  });

export const completeEncounter = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { childId: string; char: string }) => input)
  .handler(async ({ context, data }) => {
    const { child, map } = await loadProgress(context.userId, data.childId);
    const now = new Date().toISOString();
    const next = evaluateProgress(
      map.get(data.char) ?? emptyProgress(data.char),
      { type: "completeEncounter", nowIso: now },
      paramsForChar(data.char, child.grade),
    );
    await saveProgress(context.userId, data.childId, next);
    return { progress: next };
  });

export const completeUnderstand = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { childId: string; char: string }) => input)
  .handler(async ({ context, data }) => {
    const { child, map } = await loadProgress(context.userId, data.childId);
    const now = new Date().toISOString();
    const next = evaluateProgress(
      map.get(data.char) ?? emptyProgress(data.char),
      { type: "completeUnderstand", nowIso: now },
      paramsForChar(data.char, child.grade),
    );
    await saveProgress(context.userId, data.childId, next);
    return { progress: next };
  });

export const submitPractice = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: {
    childId: string;
    char: string;
    itemId: string;
    choiceId: string;
    isEcho: boolean;
    echoBatchDone: boolean;
    sessionId: string;
  }) => input)
  .handler(async ({ context, data }) => {
    const item = getItem(data.itemId, true);
    if (!item || item.kanji !== data.char) throw new Error("unknown item");
    const graded = gradeChoice(item, data.choiceId);

    const { child, map } = await loadProgress(context.userId, data.childId);

    const now = new Date().toISOString();
    const p = paramsForChar(data.char, child.grade);
    const prev = map.get(data.char) ?? emptyProgress(data.char);
    const scoringEcho = echoIsDue(prev, now);
    const next = evaluateProgress(
      prev,
      {
        type: "answer",
        kind: item.kind,
        correct: graded.correct,
        isEcho: scoringEcho,
        echoBatchDone: scoringEcho,
        nowIso: now,
        shapeAvailable: shapeSurfaceAvailable(data.char),
        surfaceId: item.surfaceId ?? item.payload.surface?.id ?? `${item.kanji}:solo`,
        gentle: Boolean(item.payload.confusable || item.payload.phoneticFamily || item.payload.cloze),
      },
      p,
    );
    await saveProgress(context.userId, data.childId, next);
    await awardStamp(context.userId, data.childId, prev, next);
    await maybeRecordInspection({
      userId: context.userId,
      childId: data.childId,
      kanji: data.char,
      prev,
      next,
      nowIso: now,
    });

    const sql = await getSql();
    await sql`
      insert into practice_events (
        user_id, child_id, kanji, kind, correct, prompt, answer, item_id, is_echo, session_id
      )
      values (
        ${context.userId}, ${data.childId}, ${data.char}, ${item.kind}, ${graded.correct},
        ${item.payload.prompt}, ${graded.label}, ${data.itemId}, ${scoringEcho}, ${data.sessionId}
      )
    `;

    return {
      correct: graded.correct,
      label: graded.label,
      progress: next,
      gradePerfect: buildGradeRings({
        progress: (() => {
          const nextMap = new Map(map);
          nextMap.set(data.char, next);
          return nextMap;
        })(),
        profileGrade: child.grade,
      }).find((r) => r.grade === (getKanji(data.char)?.grade ?? child.grade))?.perfect ?? 0,
    };
  });

export const listMistakes = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((childId: string) => childId)
  .handler(async ({ context, data: childId }) => {
    const sql = await getSql();
    const rows = await sql<{
      kanji: string;
      kind: string;
      answer: string;
      created_at: string | Date;
    }>`
      select kanji, kind, answer, created_at
      from practice_events
      where user_id = ${context.userId} and child_id = ${childId} and correct = false
      order by created_at desc
      limit 40
    `;
    return rows.map((r) => ({
      kanji: r.kanji,
      kind: r.kind,
      answer: r.answer,
      created_at: iso(r.created_at) ?? "",
    }));
  });

export const getParentOverview = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((childId: string) => childId)
  .handler(async ({ context, data: childId }) => {
    const { child, map } = await loadProgress(context.userId, childId);
    const trains = decorateTrains(child.grade, map);
    const counts: Record<MasteryStatus, number> = {
      new: 0,
      lost: 0,
      fix: 0,
      almost: 0,
      perfect: 0,
    };
    let total = 0;
    for (const t of trains) {
      for (const car of t.cars) {
        total += 1;
        counts[car.status] += 1;
      }
    }
    const sql = await getSql();
    const recent = await sql<{
      kanji: string;
      kind: string;
      correct: boolean;
      created_at: string | Date;
      is_echo: boolean;
      session_id: string;
      answer: string;
    }>`
      select kanji, kind, correct, created_at, is_echo, session_id, answer
      from practice_events
      where user_id = ${context.userId} and child_id = ${childId}
      order by created_at desc
      limit 200
    `;
    const events: ReportEvent[] = recent.map((ev) => ({
      kanji: ev.kanji,
      kind: ev.kind,
      correct: asBool(ev.correct),
      created_at: iso(ev.created_at) ?? "",
      is_echo: asBool(ev.is_echo),
      session_id: String(ev.session_id ?? ""),
      answer: String(ev.answer ?? ""),
    }));
    const stamps = await listStamps(context.userId, childId);
    const report = buildParentReport({
      grade: child.grade,
      progress: map,
      events,
      stamps,
    });
    const nowIso = new Date().toISOString();
    const routeRow = await loadChildRoute(context.userId, childId);
    const ensured = await ensureChildPlan(context.userId, routeRow, map, nowIso);
    const inspections = await loadInspections(context.userId, childId);
    const weekly = buildWeeklyPlan({
      route: ensured.route,
      plan: ensured.plan,
      progress: map,
      inspections,
      weeklyNewCap: routeRow.weeklyNewCap,
      nowIso,
    });
    const forward = buildForwardMetrics({
      route: ensured.route,
      plan: weekly,
      progress: map,
      events,
      inspections,
      nowIso,
    });
    const arrival = buildProjectedArrival({
      route: ensured.route,
      progress: map,
      events,
      nowIso,
      weeklyNewCap: routeRow.weeklyNewCap,
    });
    const allRoutes = await listChildRoutes(context.userId, childId);
    const history = allRoutes.filter((r) => r.id !== ensured.route.id);
    return {
      child: { ...child, startBand: routeRow.startBand },
      trains,
      counts: report.counts,
      total,
      perfect: counts.perfect,
      started: map.size,
      recent: events.slice(0, 12),
      stamps,
      stampCount: stamps.length,
      lines: report.lines.map((line) => ({
        id: line.id,
        label: line.label,
        type: line.type,
        done: line.perfect,
        total: line.total,
      })),
      report,
      route: ensured.route,
      plan: weekly,
      forward,
      progress: Object.fromEntries(map),
      history,
      arrival,
      canRollover: canAdvanceGrade(child.grade),
      aprilPrompt: shouldShowAprilPrompt({
        grade: child.grade,
        nowIso,
        dismissedSy: routeRow.rolloverDismissedSy,
      }),
    };
  });

export const getMapState = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { childId: string; grade?: number }) => input)
  .handler(async ({ context, data }) => {
    const { child, map } = await loadProgress(context.userId, data.childId);
    const now = new Date().toISOString();
    const viewGrade = parseGrade(data.grade) ?? child.grade;
    const lines = mapLinesFor(viewGrade).map((view) => ({
      ...view,
      stations: view.stations.map((station) => ({
        ...station,
        status: map.get(station.kanji)?.status ?? "new",
        echoDue: echoIsDue(map.get(station.kanji) ?? emptyProgress(station.kanji), now),
        echoDueAt: (map.get(station.kanji) ?? emptyProgress(station.kanji)).echoDueAt,
      })),
    }));
    return { child, viewGrade, lines };
  });

export const getStampBook = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((childId: string) => childId)
  .handler(async ({ context, data: childId }) => {
    const { child } = await loadProgress(context.userId, childId);
    const stamps = await listStamps(context.userId, childId);
    return { child, stamps };
  });
