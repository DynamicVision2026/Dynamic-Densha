import type { Grade } from "@/data/kyoiku";
import { GRADE_COUNTS } from "@/data/kyoiku";
import type { GradeRingView } from "@/lib/train-overview";

/** Picture-book consist on the door. Not a learner record. */
export const DOOR_CONSIST = ["一", "音", "下", "火"] as const;

/** Decorative rings for the door train. Does not read or write progress. */
export function doorRings(profileGrade: Grade = 1): GradeRingView[] {
  const grades: Grade[] = [1, 2, 3, 4, 5, 6];
  return grades.map((grade) => {
    const total = GRADE_COUNTS[grade];
    const sample = grade === 1 ? [...DOOR_CONSIST] : [];
    return {
      grade,
      total,
      perfect: sample.length,
      ridden: sample.length,
      open: grade <= profileGrade,
      complete: false,
      consist: sample,
    };
  });
}
