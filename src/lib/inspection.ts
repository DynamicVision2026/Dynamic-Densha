import type { ProgressState } from "./progress-eval.ts";

/** Quiet days after green before the first 点検. Flag only — never demotes. */
export const INSPECTION_FIRST_DAYS = 60;
/** After a passed 点検. */
export const INSPECTION_NEXT_DAYS = 150;
/** Child 発車標 きょう cap. */
export const INSPECTION_DAILY_CAP = 3;

export type InspectionRow = {
  kanji: string;
  lastAt: string | null;
  count: number;
};

function daysBetween(fromIso: string, toIso: string): number {
  return (Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000;
}

/**
 * 点検 is a freshness flag. Timeout / calendar silence never strips かんぺき.
 * Does not call evaluateProgress.
 */
export function isInspectionDue(
  progress: ProgressState | undefined,
  inspection: InspectionRow | undefined,
  nowIso: string,
): boolean {
  if (!progress || progress.status !== "perfect") return false;
  const count = inspection?.count ?? 0;
  if (count > 0 && inspection?.lastAt) {
    return daysBetween(inspection.lastAt, nowIso) >= INSPECTION_NEXT_DAYS;
  }
  const quietFrom = progress.lastPracticeAt ?? progress.perfectAt;
  if (!quietFrom) return false;
  return daysBetween(quietFrom, nowIso) >= INSPECTION_FIRST_DAYS;
}

export function dueInspections(input: {
  progress: Map<string, ProgressState> | Record<string, ProgressState>;
  inspections: Record<string, InspectionRow>;
  nowIso: string;
  cap?: number;
}): string[] {
  const cap = input.cap ?? INSPECTION_DAILY_CAP;
  const rows = input.progress instanceof Map ? [...input.progress.values()] : Object.values(input.progress);
  const due = rows
    .filter((row) => isInspectionDue(row, input.inspections[row.kanji], input.nowIso))
    .sort((a, b) => Date.parse(a.perfectAt ?? a.lastPracticeAt ?? "0") - Date.parse(b.perfectAt ?? b.lastPracticeAt ?? "0"))
    .map((row) => row.kanji);
  return due.slice(0, cap);
}

/** Record a passed 点検 (still かんぺき after the ride). */
export function markInspectionPass(
  prev: Record<string, InspectionRow>,
  kanji: string,
  nowIso: string,
): Record<string, InspectionRow> {
  const row = prev[kanji];
  return {
    ...prev,
    [kanji]: {
      kanji,
      lastAt: nowIso,
      count: (row?.count ?? 0) + 1,
    },
  };
}
