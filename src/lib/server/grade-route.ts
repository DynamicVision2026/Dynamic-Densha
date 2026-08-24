import { getSql } from "@/lib/db";
import type { Grade } from "@/data/kyoiku";
import {
  DEFAULT_WEEKLY_NEW,
  makeGradeRoute,
  parseStartBand,
  startIndexFor,
  type GradeRoute,
  type StartBand,
} from "@/lib/grade-route";
import { planRollover } from "@/lib/grade-rollover";
import type { InspectionRow } from "@/lib/inspection";
import { markInspectionPass } from "@/lib/inspection";
import { isInspectionDue } from "@/lib/inspection";
import { rollPlanState, type PlanState } from "@/lib/weekly-plan";
import type { ProgressState } from "@/lib/progress-eval";

export type ChildRouteRow = {
  id: string;
  name: string;
  grade: Grade;
  createdAt: string;
  startBand: StartBand;
  weeklyNewCap: number;
  activeGradeRouteId: string | null;
  planWeekStart: string | null;
  planCursor: number;
  planNewKanji: string[];
  rolloverDismissedSy: number | null;
};

function parseKanjiList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  try {
    const v = JSON.parse(String(raw ?? "[]"));
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

function asBand(raw: unknown): StartBand {
  return parseStartBand(raw) ?? "beginning";
}

export async function loadChildRoute(userId: string, childId: string): Promise<ChildRouteRow> {
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    name: string;
    grade: number;
    created_at: string | Date;
    start_band: string | null;
    weekly_new_cap: number | null;
    active_grade_route_id: string | null;
    plan_week_start: string | null;
    plan_cursor: number | null;
    plan_new_kanji: string | null;
    rollover_dismissed_sy: number | null;
  }>`
    select id, name, grade, created_at, start_band, weekly_new_cap,
           active_grade_route_id, plan_week_start, plan_cursor, plan_new_kanji,
           rollover_dismissed_sy
    from children
    where id = ${childId} and user_id = ${userId}
  `;
  const r = rows[0];
  if (!r) throw new Error("こどもが見つかりません");
  const created =
    r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at);
  return {
    id: r.id,
    name: r.name,
    grade: r.grade as Grade,
    createdAt: created,
    startBand: asBand(r.start_band),
    weeklyNewCap: Number(r.weekly_new_cap ?? DEFAULT_WEEKLY_NEW) || DEFAULT_WEEKLY_NEW,
    activeGradeRouteId: r.active_grade_route_id,
    planWeekStart: r.plan_week_start ? String(r.plan_week_start).slice(0, 10) : null,
    planCursor: Number(r.plan_cursor ?? 0) || 0,
    planNewKanji: parseKanjiList(r.plan_new_kanji),
    rolloverDismissedSy: r.rollover_dismissed_sy == null ? null : Number(r.rollover_dismissed_sy),
  };
}

export async function insertGradeRoute(
  userId: string,
  childId: string,
  grade: Grade,
  startBand: StartBand,
  nowIso = new Date().toISOString(),
): Promise<GradeRoute> {
  const sql = await getSql();
  const route = makeGradeRoute({
    id: crypto.randomUUID(),
    childId,
    grade,
    startBand,
    nowIso,
  });
  await sql`
    insert into grade_routes (id, user_id, child_id, grade, ordered_kanji, start_index, start_band, created_at)
    values (
      ${route.id}, ${userId}, ${childId}, ${route.grade},
      ${JSON.stringify(route.orderedKanji)}, ${route.startIndex}, ${route.startBand}, ${route.createdAt}
    )
  `;
  return route;
}

export async function readGradeRoute(userId: string, routeId: string): Promise<GradeRoute | null> {
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    child_id: string;
    grade: number;
    ordered_kanji: string;
    start_index: number;
    start_band: string;
    created_at: string | Date;
    archived_at: string | Date | null;
    superseded_by: string | null;
  }>`
    select id, child_id, grade, ordered_kanji, start_index, start_band, created_at,
           archived_at, superseded_by
    from grade_routes
    where id = ${routeId} and user_id = ${userId}
  `;
  const r = rows[0];
  if (!r) return null;
  const created = r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at);
  return {
    id: r.id,
    childId: r.child_id,
    grade: r.grade as Grade,
    orderedKanji: parseKanjiList(r.ordered_kanji),
    startIndex: Number(r.start_index) || 0,
    startBand: asBand(r.start_band),
    createdAt: created,
    archivedAt: r.archived_at
      ? r.archived_at instanceof Date
        ? r.archived_at.toISOString()
        : String(r.archived_at)
      : null,
    supersededBy: r.superseded_by,
  };
}

export async function savePlan(userId: string, childId: string, plan: PlanState) {
  const sql = await getSql();
  await sql`
    update children
    set plan_week_start = ${plan.weekStart},
        plan_cursor = ${plan.cursor},
        plan_new_kanji = ${JSON.stringify(plan.newKanji)}
    where id = ${childId} and user_id = ${userId}
  `;
}

export async function ensureChildPlan(
  userId: string,
  child: ChildRouteRow,
  progress: Map<string, ProgressState>,
  nowIso = new Date().toISOString(),
): Promise<{ child: ChildRouteRow; route: GradeRoute; plan: PlanState }> {
  let route: GradeRoute | null = child.activeGradeRouteId
    ? await readGradeRoute(userId, child.activeGradeRouteId)
    : null;
  if (!route) {
    route = await insertGradeRoute(userId, child.id, child.grade, child.startBand, nowIso);
    const sql = await getSql();
    await sql`
      update children
      set active_grade_route_id = ${route.id}
      where id = ${child.id} and user_id = ${userId}
    `;
    child = { ...child, activeGradeRouteId: route.id };
  }
  const prev: PlanState | null = child.planWeekStart
    ? { weekStart: child.planWeekStart, cursor: child.planCursor, newKanji: child.planNewKanji }
    : null;
  const rolled = rollPlanState(prev, route, child.weeklyNewCap, progress, nowIso);
  if (
    rolled.weekStart !== child.planWeekStart ||
    rolled.cursor !== child.planCursor ||
    JSON.stringify(rolled.newKanji) !== JSON.stringify(child.planNewKanji)
  ) {
    await savePlan(userId, child.id, rolled);
  }
  return { child: { ...child, planWeekStart: rolled.weekStart, planCursor: rolled.cursor, planNewKanji: rolled.newKanji }, route, plan: rolled };
}

export async function loadInspections(
  userId: string,
  childId: string,
): Promise<Record<string, InspectionRow>> {
  const sql = await getSql();
  const rows = await sql<{ kanji: string; last_at: string | Date | null; count: number }>`
    select kanji, last_at, count from inspections
    where child_id = ${childId} and user_id = ${userId}
  `;
  const out: Record<string, InspectionRow> = {};
  for (const r of rows) {
    const lastAt =
      r.last_at instanceof Date ? r.last_at.toISOString() : r.last_at ? String(r.last_at) : null;
    out[r.kanji] = { kanji: r.kanji, lastAt, count: Number(r.count) || 0 };
  }
  return out;
}

export async function recordInspectionPass(
  userId: string,
  childId: string,
  kanji: string,
  nowIso: string,
) {
  const sql = await getSql();
  const existing = await loadInspections(userId, childId);
  const next = markInspectionPass(existing, kanji, nowIso)[kanji]!;
  await sql.query(
    `insert into inspections (user_id, child_id, kanji, last_at, count)
     values ($1,$2,$3,$4,$5)
     on conflict (child_id, kanji)
     do update set last_at = excluded.last_at, count = excluded.count
     where inspections.user_id = $1`,
    [userId, childId, kanji, next.lastAt, next.count],
  );
}

export async function maybeRecordInspection(input: {
  userId: string;
  childId: string;
  kanji: string;
  prev: ProgressState;
  next: ProgressState;
  nowIso: string;
}) {
  if (input.prev.status !== "perfect" || input.next.status !== "perfect") return;
  const rows = await loadInspections(input.userId, input.childId);
  if (!isInspectionDue(input.prev, rows[input.kanji], input.nowIso)) return;
  await recordInspectionPass(input.userId, input.childId, input.kanji, input.nowIso);
}

export async function listChildRoutes(userId: string, childId: string): Promise<GradeRoute[]> {
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    child_id: string;
    grade: number;
    ordered_kanji: string;
    start_index: number;
    start_band: string;
    created_at: string | Date;
    archived_at: string | Date | null;
    superseded_by: string | null;
  }>`
    select id, child_id, grade, ordered_kanji, start_index, start_band, created_at,
           archived_at, superseded_by
    from grade_routes
    where child_id = ${childId} and user_id = ${userId}
    order by created_at asc
  `;
  return rows.map((r) => {
    const created = r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at);
    const archivedAt = r.archived_at
      ? r.archived_at instanceof Date
        ? r.archived_at.toISOString()
        : String(r.archived_at)
      : null;
    return {
      id: r.id,
      childId: r.child_id,
      grade: r.grade as Grade,
      orderedKanji: parseKanjiList(r.ordered_kanji),
      startIndex: Number(r.start_index) || 0,
      startBand: asBand(r.start_band),
      createdAt: created,
      archivedAt,
      supersededBy: r.superseded_by,
    };
  });
}

export async function performChildRollover(
  userId: string,
  childId: string,
  nowIso = new Date().toISOString(),
): Promise<
  | { ok: true; grade: Grade; route: GradeRoute; history: GradeRoute[] }
  | { ok: false; reason: "cap" }
> {
  const child = await loadChildRoute(userId, childId);
  const current =
    (child.activeGradeRouteId ? await readGradeRoute(userId, child.activeGradeRouteId) : null) ??
    makeGradeRoute({ childId, grade: child.grade, startBand: child.startBand, nowIso });
  const planned = planRollover({
    current,
    weeklyNewCap: child.weeklyNewCap,
    nowIso,
  });
  if (!planned.ok) return planned;
  const next = await insertGradeRoute(userId, childId, planned.grade, "beginning", nowIso);
  const sql = await getSql();
  if (child.activeGradeRouteId) {
    await sql`
      update grade_routes
      set archived_at = ${nowIso}, superseded_by = ${next.id}
      where id = ${child.activeGradeRouteId} and user_id = ${userId}
    `;
  }
  await sql`
    update children
    set grade = ${planned.grade},
        start_band = 'beginning',
        active_grade_route_id = ${next.id},
        plan_week_start = ${planned.plan.weekStart},
        plan_cursor = ${planned.plan.cursor},
        plan_new_kanji = ${JSON.stringify(planned.plan.newKanji)}
    where id = ${childId} and user_id = ${userId}
  `;
  const history = await listChildRoutes(userId, childId);
  return { ok: true, grade: planned.grade, route: next, history };
}

export async function dismissRolloverPrompt(
  userId: string,
  childId: string,
  schoolYear: number,
) {
  const sql = await getSql();
  await sql`
    update children
    set rollover_dismissed_sy = ${schoolYear}
    where id = ${childId} and user_id = ${userId}
  `;
}

export { startIndexFor };
