import { trainsForGrade, type Grade, type TrainDef } from "../data/kyoiku.ts";
import { isCleared, type MasteryStatus } from "./mastery.ts";

export type TrainView = TrainDef & {
  unlocked: boolean;
  cleared: boolean;
  cars: { char: string; status: MasteryStatus; echoDue?: boolean; echoDueAt?: string | null }[];
};

/** Product: all 配当 cars in the selected grade are open. Jump is allowed. */
export function decorateTrains(
  grade: Grade,
  map: Map<string, { status: MasteryStatus }>,
): TrainView[] {
  const trains = trainsForGrade(grade);
  return trains.map((t) => {
    const cars = t.chars.map((char) => ({
      char,
      status: map.get(char)?.status ?? ("new" as const),
    }));
    return {
      ...t,
      cars,
      unlocked: true,
      cleared: cars.every((c) => isCleared(c.status)),
    };
  });
}
