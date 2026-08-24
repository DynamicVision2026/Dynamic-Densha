import { echoIsDue, type ProgressState } from "./progress-eval.ts";
import { echoArrival } from "./echo-arrival.ts";
import { dueInspections, INSPECTION_DAILY_CAP, type InspectionRow } from "./inspection.ts";
import type { WeeklyPlan } from "./weekly-plan.ts";

export type BoardKind = "echo" | "inspect" | "new" | "return";

export type BoardCar = {
  kanji: string;
  kind: BoardKind;
  when?: "today" | "tomorrow" | "dayAfter";
};

export type DepartureBoard = {
  today: BoardCar[];
  tomorrow: BoardCar[];
  newStations: string[];
  returnStations: string[];
};

/**
 * Child-safe 発車標. Dates only for this week / next echo labels already in-product.
 * Never includes deficit totals or catch-up shame copy.
 */
export function buildDepartureBoard(input: {
  progress: Map<string, ProgressState> | Record<string, ProgressState>;
  inspections: Record<string, InspectionRow>;
  plan: WeeklyPlan;
  nowIso: string;
}): DepartureBoard {
  const rows = input.progress instanceof Map ? [...input.progress.values()] : Object.values(input.progress);
  const today: BoardCar[] = [];
  const tomorrow: BoardCar[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    if (echoIsDue(row, input.nowIso)) {
      today.push({ kanji: row.kanji, kind: "echo", when: "today" });
      seen.add(row.kanji);
      continue;
    }
    if (row.status === "almost" && row.echoDueAt) {
      const kind = echoArrival(row.echoDueAt, input.nowIso).kind;
      if (kind === "tomorrow" || kind === "dayAfter") {
        tomorrow.push({
          kanji: row.kanji,
          kind: "echo",
          when: kind === "dayAfter" ? "dayAfter" : "tomorrow",
        });
      }
    }
  }

  const inspect = dueInspections({
    progress: input.progress,
    inspections: input.inspections,
    nowIso: input.nowIso,
    cap: INSPECTION_DAILY_CAP,
  });
  for (const kanji of inspect) {
    if (seen.has(kanji)) continue;
    today.push({ kanji, kind: "inspect", when: "today" });
    seen.add(kanji);
  }

  return {
    today,
    tomorrow,
    newStations: input.plan.newKanji,
    returnStations: input.plan.returnKanji,
  };
}
