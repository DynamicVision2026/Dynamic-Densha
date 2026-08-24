import type { Grade } from "../data/kyoiku.ts";
import { ymdInZone } from "./echo-arrival.ts";
import {
  DEFAULT_WEEKLY_NEW,
  makeGradeRoute,
  type GradeRoute,
} from "./grade-route.ts";
import type { ProgressState } from "./progress-eval.ts";
import { pickWeeklyNew, rollPlanState, tokyoWeekStart, type PlanState } from "./weekly-plan.ts";

const TOKYO = "Asia/Tokyo";

/** Tokyo March 1 – April 30. School-year boundary window. */
export const APRIL_PROMPT_MONTHS = [3, 4] as const;

export function nextGrade(grade: Grade): Grade | null {
  if (grade >= 6) return null;
  return (grade + 1) as Grade;
}

export function canAdvanceGrade(grade: Grade): boolean {
  return nextGrade(grade) !== null;
}

/** School year starting April of this year-number (Tokyo). Aug 2026 → 2026. */
export function schoolYearStartYear(nowIso: string): number {
  const [y, m] = ymdInZone(nowIso, TOKYO).split("-").map(Number);
  const year = y ?? 2026;
  const month = m ?? 1;
  return month >= 4 ? year : year - 1;
}

/** April boundary year to tag a dismiss (Mar/Apr 2026 → 2026). */
export function aprilBoundaryYear(nowIso: string): number | null {
  const month = Number(ymdInZone(nowIso, TOKYO).slice(5, 7));
  if (month !== 3 && month !== 4) return null;
  const [y] = ymdInZone(nowIso, TOKYO).split("-").map(Number);
  return y ?? null;
}

export function inAprilPromptWindow(nowIso: string): boolean {
  return aprilBoundaryYear(nowIso) !== null;
}

export function shouldShowAprilPrompt(input: {
  grade: Grade;
  nowIso: string;
  dismissedSy?: number | null;
}): boolean {
  if (!canAdvanceGrade(input.grade)) return false;
  const boundary = aprilBoundaryYear(input.nowIso);
  if (boundary == null) return false;
  return input.dismissedSy !== boundary;
}

export type RolloverPlan =
  | {
      ok: true;
      from: GradeRoute;
      next: GradeRoute;
      plan: PlanState;
      grade: Grade;
    }
  | { ok: false; reason: "cap" };

/**
 * Parent-confirmed advance. Old snapshot is not rewritten.
 * New weekly package is taken from the new grade list only.
 */
export function planRollover(input: {
  current: GradeRoute;
  progress?: Map<string, ProgressState> | Record<string, ProgressState>;
  weeklyNewCap?: number;
  nowIso: string;
  nextRouteId?: string;
}): RolloverPlan {
  const grade = nextGrade(input.current.grade);
  if (!grade) return { ok: false, reason: "cap" };
  const cap = input.weeklyNewCap ?? DEFAULT_WEEKLY_NEW;
  const progress = input.progress ?? new Map();
  const next = makeGradeRoute({
    id: input.nextRouteId,
    childId: input.current.childId,
    grade,
    startBand: "beginning",
    nowIso: input.nowIso,
  });
  const plan = rollPlanState(null, next, cap, progress, input.nowIso);
  return { ok: true, from: input.current, next, plan, grade };
}

/** True when a new-this-week list pulled leftover cars from another grade. */
export function newPackTouches(route: GradeRoute, pack: string[], other: string[]): boolean {
  const mine = new Set(route.orderedKanji);
  return pack.some((ch) => other.includes(ch) && !mine.has(ch));
}

export function firstWeekOnNewRoute(
  next: GradeRoute,
  cap = DEFAULT_WEEKLY_NEW,
  progress: Map<string, ProgressState> | Record<string, ProgressState> = new Map(),
): string[] {
  return pickWeeklyNew(next.orderedKanji, next.startIndex, cap, progress);
}

export { tokyoWeekStart };
