import { trainsForGrade, type Grade } from "../data/kyoiku.ts";

export type StartBand = "beginning" | "middle" | "end";
export const START_BANDS: StartBand[] = ["beginning", "middle", "end"];
export const DEFAULT_WEEKLY_NEW = 5;

export type GradeRoute = {
  id: string;
  childId: string;
  grade: Grade;
  orderedKanji: string[];
  /** Day-one origin. Never rewritten after create. */
  startIndex: number;
  startBand: StartBand;
  createdAt: string;
  archivedAt?: string | null;
  supersededBy?: string | null;
};

export function parseStartBand(v: unknown): StartBand | undefined {
  if (v === "beginning" || v === "middle" || v === "end") return v;
  return undefined;
}

export function orderedKanjiForGrade(grade: Grade): string[] {
  return trainsForGrade(grade).flatMap((t) => t.chars);
}

/** Documented cuts: 0 / ~⅓ / ~⅔ of the grade list. */
export function startIndexFor(band: StartBand, n: number): number {
  if (n <= 0) return 0;
  if (band === "middle") return Math.floor(n / 3);
  if (band === "end") return Math.floor((2 * n) / 3);
  return 0;
}

export function makeGradeRoute(input: {
  id?: string;
  childId: string;
  grade: Grade;
  startBand: StartBand;
  nowIso?: string;
}): GradeRoute {
  const orderedKanji = orderedKanjiForGrade(input.grade);
  return {
    id: input.id ?? `route-${input.childId}-${input.grade}`,
    childId: input.childId,
    grade: input.grade,
    orderedKanji,
    startIndex: startIndexFor(input.startBand, orderedKanji.length),
    startBand: input.startBand,
    createdAt: input.nowIso ?? new Date().toISOString(),
  };
}

export function reachedBlueOrGreen(status: string | undefined | null): boolean {
  return status === "almost" || status === "perfect";
}
