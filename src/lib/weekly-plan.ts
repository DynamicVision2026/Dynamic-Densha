import { ymdInZone } from "./echo-arrival.ts";
import { echoIsDue, type ProgressState } from "./progress-eval.ts";
import {
  DEFAULT_WEEKLY_NEW,
  reachedBlueOrGreen,
  type GradeRoute,
} from "./grade-route.ts";
import { dueInspections, INSPECTION_DAILY_CAP, type InspectionRow } from "./inspection.ts";

const TOKYO = "Asia/Tokyo";
const WEEKDAY: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export type PlanState = {
  weekStart: string;
  cursor: number;
  /** Frozen at week tick. Not rebuilt when a car reaches だいたい. */
  newKanji: string[];
};

export type WeeklyPlan = {
  weekStart: string;
  cursor: number;
  weeklyNewCap: number;
  newKanji: string[];
  returnKanji: string[];
};

function weekdayTokyo(iso: string): number {
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone: TOKYO,
    weekday: "short",
  }).format(new Date(iso));
  return WEEKDAY[wd] ?? 1;
}

/** Monday (Asia/Tokyo) as YYYY-MM-DD. Registration-week clock, not April. */
export function tokyoWeekStart(nowIso: string): string {
  const ymd = ymdInZone(nowIso, TOKYO);
  const sinceMonday = (weekdayTokyo(nowIso) + 6) % 7;
  const [y, m, d] = ymd.split("-").map(Number);
  const utc = Date.UTC(y!, (m ?? 1) - 1, (d ?? 1) - sinceMonday);
  return new Date(utc).toISOString().slice(0, 10);
}

export function tokyoWeekEnd(weekStart: string): string {
  const [y, m, d] = weekStart.split("-").map(Number);
  const utc = Date.UTC(y!, (m ?? 1) - 1, (d ?? 1) + 6);
  return new Date(utc).toISOString().slice(0, 10);
}

function daysBetweenYmd(a: string, b: string): number {
  return (Date.parse(`${b}T00:00:00.000Z`) - Date.parse(`${a}T00:00:00.000Z`)) / 86_400_000;
}

export function weeksElapsed(fromStart: string, toStart: string): number {
  const days = daysBetweenYmd(fromStart, toStart);
  if (days <= 0) return 0;
  return Math.max(1, Math.round(days / 7));
}

function statusOf(
  progress: Map<string, ProgressState> | Record<string, ProgressState>,
  kanji: string,
): string | undefined {
  if (progress instanceof Map) return progress.get(kanji)?.status;
  return progress[kanji]?.status;
}

/** This week's new cars from the cursor. Skip already blue/green; never dump extra missed weeks. */
export function pickWeeklyNew(
  ordered: string[],
  cursor: number,
  cap: number,
  progress: Map<string, ProgressState> | Record<string, ProgressState>,
): string[] {
  const out: string[] = [];
  for (let i = cursor; i < ordered.length && out.length < cap; i++) {
    const ch = ordered[i]!;
    if (reachedBlueOrGreen(statusOf(progress, ch))) continue;
    out.push(ch);
  }
  return out;
}

function inThisWeek(iso: string | null | undefined, weekStart: string, weekEnd: string): boolean {
  if (!iso) return false;
  const ymd = ymdInZone(iso);
  return ymd <= weekEnd && ymd >= weekStart;
}

/** Due 残響 this week (including きょう/overdue-as-today), then 点検, capped. */
export function pickWeeklyReturns(input: {
  progress: Map<string, ProgressState> | Record<string, ProgressState>;
  inspections?: Record<string, InspectionRow>;
  weekStart: string;
  nowIso: string;
  cap?: number;
}): string[] {
  const cap = input.cap ?? 8;
  const weekEnd = tokyoWeekEnd(input.weekStart);
  const rows = input.progress instanceof Map ? [...input.progress.values()] : Object.values(input.progress);
  const echoes: string[] = [];
  for (const row of rows) {
    if (row.status !== "almost" || !row.echoDueAt) continue;
    if (echoIsDue(row, input.nowIso) || inThisWeek(row.echoDueAt, input.weekStart, weekEnd)) {
      echoes.push(row.kanji);
    }
  }
  const inspect = dueInspections({
    progress: input.progress,
    inspections: input.inspections ?? {},
    nowIso: input.nowIso,
    cap: INSPECTION_DAILY_CAP * 2,
  }).filter((k) => !echoes.includes(k));
  return [...echoes, ...inspect].slice(0, cap);
}

/**
 * Advance the weekly cursor when the Tokyo week ticks.
 * Missed weeks move the cursor by cap each — they are not packed into this week.
 */
export function rollPlanState(
  prev: PlanState | null | undefined,
  route: GradeRoute,
  cap: number,
  progress: Map<string, ProgressState> | Record<string, ProgressState>,
  nowIso: string,
): PlanState {
  const thisWeek = tokyoWeekStart(nowIso);
  const origin = route.startIndex;
  if (!prev?.weekStart) {
    return {
      weekStart: thisWeek,
      cursor: origin,
      newKanji: pickWeeklyNew(route.orderedKanji, origin, cap, progress),
    };
  }
  if (prev.weekStart === thisWeek) {
    return {
      weekStart: prev.weekStart,
      cursor: prev.cursor,
      newKanji: prev.newKanji ?? pickWeeklyNew(route.orderedKanji, prev.cursor, cap, progress),
    };
  }
  const weeks = weeksElapsed(prev.weekStart, thisWeek);
  const nextCursor = Math.min(route.orderedKanji.length, prev.cursor + weeks * cap);
  return {
    weekStart: thisWeek,
    cursor: nextCursor,
    newKanji: pickWeeklyNew(route.orderedKanji, nextCursor, cap, progress),
  };
}

export function buildWeeklyPlan(input: {
  route: GradeRoute;
  plan: PlanState;
  progress: Map<string, ProgressState> | Record<string, ProgressState>;
  inspections?: Record<string, InspectionRow>;
  weeklyNewCap?: number;
  nowIso: string;
}): WeeklyPlan {
  const cap = input.weeklyNewCap ?? DEFAULT_WEEKLY_NEW;
  return {
    weekStart: input.plan.weekStart,
    cursor: input.plan.cursor,
    weeklyNewCap: cap,
    newKanji: input.plan.newKanji,
    returnKanji: pickWeeklyReturns({
      progress: input.progress,
      inspections: input.inspections,
      weekStart: input.plan.weekStart,
      nowIso: input.nowIso,
    }),
  };
}
