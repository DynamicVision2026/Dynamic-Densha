import { ymdInZone } from "./echo-arrival.ts";
import { reachedBlueOrGreen, type GradeRoute, type StartBand } from "./grade-route.ts";
import { isInspectionDue, type InspectionRow } from "./inspection.ts";
import type { ReportEvent } from "./parent-report.ts";
import type { ProgressState } from "./progress-eval.ts";
import type { WeeklyPlan } from "./weekly-plan.ts";

export type ForwardMetrics = {
  startBand: StartBand;
  routeCreatedAt: string;
  stationsRemaining: number;
  routeTotal: number;
  greenCount: number;
  rideDays28: number;
  returnRidden: number;
  returnDue: number;
  inspectionDue: number;
  weeklyNewReached: number;
  weeklyNewPlanned: number;
};

function statusOf(
  progress: Map<string, ProgressState> | Record<string, ProgressState>,
  kanji: string,
): string | undefined {
  return progress instanceof Map ? progress.get(kanji)?.status : progress[kanji]?.status;
}

const DAY_MS = 86_400_000;

/** Parent-only, forward. Never "weeks behind" / streak / peer. */
export function buildForwardMetrics(input: {
  route: GradeRoute;
  plan: WeeklyPlan;
  progress: Map<string, ProgressState> | Record<string, ProgressState>;
  events: ReportEvent[];
  inspections: Record<string, InspectionRow>;
  nowIso: string;
}): ForwardMetrics {
  const remaining = input.route.orderedKanji
    .slice(input.plan.cursor)
    .filter((ch) => !reachedBlueOrGreen(statusOf(input.progress, ch))).length;
  const rows = input.progress instanceof Map ? [...input.progress.values()] : Object.values(input.progress);
  const greenCount = rows.filter((r) => r.status === "perfect").length;

  const since28 = Date.parse(input.nowIso) - 28 * DAY_MS;
  const rideDays = new Set<string>();
  for (const ev of input.events) {
    if (Date.parse(ev.created_at) >= since28) rideDays.add(ymdInZone(ev.created_at));
  }

  const weekStart = input.plan.weekStart;
  const ridden = new Set<string>();
  for (const ev of input.events) {
    if (ymdInZone(ev.created_at) >= weekStart && input.plan.returnKanji.includes(ev.kanji)) {
      ridden.add(ev.kanji);
    }
  }

  const weeklyNewReached = input.plan.newKanji.filter((ch) =>
    reachedBlueOrGreen(statusOf(input.progress, ch)),
  ).length;

  let inspectionDue = 0;
  for (const row of rows) {
    if (isInspectionDue(row, input.inspections[row.kanji], input.nowIso)) inspectionDue += 1;
  }

  return {
    startBand: input.route.startBand,
    routeCreatedAt: input.route.createdAt,
    stationsRemaining: remaining,
    routeTotal: input.route.orderedKanji.length,
    greenCount,
    rideDays28: rideDays.size,
    returnRidden: ridden.size,
    returnDue: input.plan.returnKanji.length,
    inspectionDue,
    weeklyNewReached,
    weeklyNewPlanned: input.plan.newKanji.length,
  };
}
