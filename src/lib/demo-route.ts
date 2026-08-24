import {
  DEFAULT_WEEKLY_NEW,
  makeGradeRoute,
  parseStartBand,
  startIndexFor,
  type GradeRoute,
  type StartBand,
} from "./grade-route.ts";
import {
  canAdvanceGrade,
  planRollover,
  shouldShowAprilPrompt,
  aprilBoundaryYear,
} from "./grade-rollover.ts";
import { markInspectionPass, type InspectionRow } from "./inspection.ts";
import { buildDepartureBoard, type DepartureBoard } from "./departure-board.ts";
import { buildForwardMetrics, type ForwardMetrics } from "./parent-forward.ts";
import { buildProjectedArrival, type ProjectedArrival } from "./projected-arrival.ts";
import { buildWeeklyPlan, rollPlanState, type PlanState, type WeeklyPlan } from "./weekly-plan.ts";
import type { ProgressState } from "./progress-eval.ts";
import type { ReportEvent } from "./parent-report.ts";
import type { Grade } from "../data/kyoiku.ts";

const ROUTE_KEY = "densha.demo.route.v1";
const PLAN_KEY = "densha.demo.plan.v1";
const INSPECT_KEY = "densha.demo.inspection.v1";
const BAND_KEY = "densha.demo.start-band.v1";
const GRADE_KEY = "densha.demo.grade.v1";
const HISTORY_KEY = "densha.demo.route.history.v1";
const DISMISS_KEY = "densha.demo.rollover-dismiss.v1";
const DEMO_ID = "demo";

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export function demoProfileGrade(): Grade {
  const n = Number(readJson<number>(GRADE_KEY, 1));
  if (n >= 1 && n <= 6) return n as Grade;
  return 1;
}

export function demoStartBand(): StartBand {
  return parseStartBand(readJson<string>(BAND_KEY, "beginning")) ?? "beginning";
}

export function readDemoHistory(): GradeRoute[] {
  return readJson<GradeRoute[]>(HISTORY_KEY, []);
}

export function demoRolloverDismissedSy(): number | null {
  const n = readJson<number | null>(DISMISS_KEY, null);
  return n == null ? null : Number(n);
}

export function readDemoRoute(): GradeRoute {
  const existing = readJson<GradeRoute | null>(ROUTE_KEY, null);
  if (existing?.orderedKanji?.length) return existing;
  const route = makeGradeRoute({
    id: "route-demo-1",
    childId: DEMO_ID,
    grade: demoProfileGrade(),
    startBand: demoStartBand(),
  });
  writeJson(ROUTE_KEY, route);
  return route;
}

export function readDemoInspections(): Record<string, InspectionRow> {
  return readJson<Record<string, InspectionRow>>(INSPECT_KEY, {});
}

function readDemoPlanRaw(): PlanState | null {
  return readJson<PlanState | null>(PLAN_KEY, null);
}

export function syncDemoPlan(
  progress: Map<string, ProgressState> | Record<string, ProgressState>,
  nowIso = new Date().toISOString(),
): { route: GradeRoute; plan: WeeklyPlan } {
  const route = readDemoRoute();
  const rolled = rollPlanState(readDemoPlanRaw(), route, DEFAULT_WEEKLY_NEW, progress, nowIso);
  writeJson(PLAN_KEY, rolled);
  return {
    route,
    plan: buildWeeklyPlan({
      route,
      plan: rolled,
      progress,
      inspections: readDemoInspections(),
      weeklyNewCap: DEFAULT_WEEKLY_NEW,
      nowIso,
    }),
  };
}

export function setDemoStartBand(
  band: StartBand,
  progress: Map<string, ProgressState> | Record<string, ProgressState>,
  nowIso = new Date().toISOString(),
): { route: GradeRoute; plan: WeeklyPlan } {
  writeJson(BAND_KEY, band);
  const route = readDemoRoute();
  const cursor = startIndexFor(band, route.orderedKanji.length);
  const seeded = rollPlanState(
    null,
    { ...route, startIndex: cursor, startBand: band },
    DEFAULT_WEEKLY_NEW,
    progress,
    nowIso,
  );
  const nextPlan: PlanState = {
    weekStart: seeded.weekStart,
    cursor,
    newKanji: seeded.newKanji,
  };
  writeJson(PLAN_KEY, nextPlan);
  return {
    route,
    plan: buildWeeklyPlan({
      route,
      plan: nextPlan,
      progress,
      inspections: readDemoInspections(),
      nowIso,
    }),
  };
}

export function confirmDemoRollover(
  progress: Map<string, ProgressState> | Record<string, ProgressState>,
  nowIso = new Date().toISOString(),
): { ok: true; grade: Grade; route: GradeRoute; history: GradeRoute[] } | { ok: false; reason: "cap" } {
  const current = readDemoRoute();
  const planned = planRollover({
    current,
    progress,
    nowIso,
    nextRouteId: `route-demo-${(current.grade + 1) as Grade}`,
  });
  if (!planned.ok) return planned;
  const archived: GradeRoute = {
    ...current,
    archivedAt: nowIso,
    supersededBy: planned.next.id,
  };
  const history = [...readDemoHistory(), archived];
  writeJson(HISTORY_KEY, history);
  writeJson(ROUTE_KEY, planned.next);
  writeJson(PLAN_KEY, planned.plan);
  writeJson(GRADE_KEY, planned.grade);
  writeJson(BAND_KEY, "beginning");
  return { ok: true, grade: planned.grade, route: planned.next, history };
}

export function dismissDemoRollover(nowIso = new Date().toISOString()) {
  const year = aprilBoundaryYear(nowIso);
  if (year != null) writeJson(DISMISS_KEY, year);
}

export function recordDemoInspection(kanji: string, nowIso = new Date().toISOString()) {
  const next = markInspectionPass(readDemoInspections(), kanji, nowIso);
  writeJson(INSPECT_KEY, next);
}

export function demoBoardAndForward(input: {
  progress: Map<string, ProgressState> | Record<string, ProgressState>;
  events: ReportEvent[];
  nowIso?: string;
}): {
  route: GradeRoute;
  plan: WeeklyPlan;
  board: DepartureBoard;
  forward: ForwardMetrics;
  history: GradeRoute[];
  arrival: ProjectedArrival;
  canRollover: boolean;
  aprilPrompt: boolean;
} {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const { route, plan } = syncDemoPlan(input.progress, nowIso);
  const inspections = readDemoInspections();
  const grade = demoProfileGrade();
  return {
    route,
    plan,
    board: buildDepartureBoard({
      progress: input.progress,
      inspections,
      plan,
      nowIso,
    }),
    forward: buildForwardMetrics({
      route,
      plan,
      progress: input.progress,
      events: input.events,
      inspections,
      nowIso,
    }),
    history: readDemoHistory(),
    arrival: buildProjectedArrival({
      route,
      progress: input.progress,
      events: input.events,
      nowIso,
    }),
    canRollover: canAdvanceGrade(grade),
    aprilPrompt: shouldShowAprilPrompt({
      grade,
      nowIso,
      dismissedSy: demoRolloverDismissedSy(),
    }),
  };
}
