import { ymdInZone } from "./echo-arrival.ts";
import { DEFAULT_WEEKLY_NEW, reachedBlueOrGreen, type GradeRoute } from "./grade-route.ts";
import { schoolYearStartYear } from "./grade-rollover.ts";
import type { ReportEvent } from "./parent-report.ts";
import type { ProgressState } from "./progress-eval.ts";

const TOKYO = "Asia/Tokyo";
const DAY_MS = 86_400_000;
const WINDOW_DAYS = 28;

export type ArrivalKind = "pace" | "unknown" | "done";

export type ProjectedArrival = {
  kind: ArrivalKind;
  /** Active route cars not yet だいたい. */
  remainingAlmost: number;
  /** Active route cars not yet かんぺき. */
  remainingPerfect: number;
  routeTotal: number;
  completedNew28: number;
  rideDays28: number;
  weeklyNewCap: number;
  ratePerWeek: number;
  weeksNeeded: number | null;
  month: number | null;
  year: number | null;
  overHorizon: boolean;
  horizonMonth: 3;
  horizonYear: number;
};

function statusOf(
  progress: Map<string, ProgressState> | Record<string, ProgressState>,
  kanji: string,
): ProgressState | undefined {
  return progress instanceof Map ? progress.get(kanji) : progress[kanji];
}

function addDaysYmd(ymd: string, days: number): string {
  const utc = Date.parse(`${ymd}T00:00:00.000Z`) + days * DAY_MS;
  return new Date(utc).toISOString().slice(0, 10);
}

/**
 * Parent-only pace estimate. Remaining = not yet だいたい on the active route.
 * Horizon = March of this school year (Apr–Mar). Never a completion guarantee.
 */
export function buildProjectedArrival(input: {
  route: GradeRoute;
  progress: Map<string, ProgressState> | Record<string, ProgressState>;
  events: ReportEvent[];
  nowIso: string;
  weeklyNewCap?: number;
}): ProjectedArrival {
  const cap = input.weeklyNewCap ?? DEFAULT_WEEKLY_NEW;
  const sy = schoolYearStartYear(input.nowIso);
  const horizonYear = sy + 1;
  const horizonYmd = `${horizonYear}-03-31`;

  let remainingAlmost = 0;
  let remainingPerfect = 0;
  let completedNew28 = 0;
  const since = Date.parse(input.nowIso) - WINDOW_DAYS * DAY_MS;

  for (const kanji of input.route.orderedKanji) {
    const row = statusOf(input.progress, kanji);
    const status = row?.status;
    if (!reachedBlueOrGreen(status)) remainingAlmost += 1;
    if (status !== "perfect") remainingPerfect += 1;
    const reachedAt = row?.almostAt ?? row?.perfectAt;
    if (reachedBlueOrGreen(status) && reachedAt && Date.parse(reachedAt) >= since) {
      completedNew28 += 1;
    }
  }

  const rideDays = new Set<string>();
  for (const ev of input.events) {
    if (Date.parse(ev.created_at) >= since) rideDays.add(ymdInZone(ev.created_at, TOKYO));
  }

  const base: Omit<ProjectedArrival, "kind" | "ratePerWeek" | "weeksNeeded" | "month" | "year" | "overHorizon"> & {
    ratePerWeek: number;
    weeksNeeded: number | null;
    month: number | null;
    year: number | null;
    overHorizon: boolean;
    kind: ArrivalKind;
  } = {
    kind: "unknown",
    remainingAlmost,
    remainingPerfect,
    routeTotal: input.route.orderedKanji.length,
    completedNew28,
    rideDays28: rideDays.size,
    weeklyNewCap: cap,
    ratePerWeek: 0,
    weeksNeeded: null,
    month: null,
    year: null,
    overHorizon: false,
    horizonMonth: 3,
    horizonYear,
  };

  if (remainingAlmost === 0) {
    return { ...base, kind: "done" };
  }

  const ratePerWeek = completedNew28 / (WINDOW_DAYS / 7);
  base.ratePerWeek = ratePerWeek;
  if (completedNew28 < 1 || ratePerWeek < 0.25) {
    return { ...base, kind: "unknown" };
  }

  const weeksNeeded = Math.max(1, Math.ceil(remainingAlmost / ratePerWeek));
  const nowYmd = ymdInZone(input.nowIso, TOKYO);
  const landYmd = addDaysYmd(nowYmd, weeksNeeded * 7);
  const [year, month] = landYmd.split("-").map(Number) as [number, number];
  const overHorizon = landYmd > horizonYmd;

  return {
    ...base,
    kind: "pace",
    weeksNeeded,
    month,
    year,
    overHorizon,
  };
}
