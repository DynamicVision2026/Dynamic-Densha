import { GRADE_COUNTS, type Grade } from "../data/kyoiku.ts";
import type { GradeRingView } from "./train-overview.ts";

/**
 * Picture-book consist on the door. Not a learner record — purely decorative,
 * never written to demo-progress storage. 26 cars (2026): the numbers 1–10
 * lead the train, then everyday G1 characters in a curated, low-to-medium
 * stroke-count order for visual rhythm. "一" stays first — it's also the
 * hardcoded target of the landing page's "try it" link.
 */
export const DOOR_CONSIST = [
  "一", "二", "三", "四", "五", "六", "七", "八", "九", "十",
  "人", "大", "小", "中", "上", "下",
  "木", "火", "水", "金", "土",
  "日", "月", "山", "川", "音",
] as const;

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
