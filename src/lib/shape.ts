/**
 * Shape light: 字体 (skeleton) correct is sufficient.
 * Minor とめ・はね・はらい variation must not fail the light
 * (文化庁「常用漢字表の字体・字形に関する指針」).
 *
 * Phase 1 has no handwriting scorer — items are whole-character MCQ.
 * The same 字体 therefore passes regardless of stroke-ending variant.
 */

export const SHAPE_STROKE_VARIANTS = ["canonical", "tome", "hane", "harai"] as const;
export type ShapeStrokeVariant = (typeof SHAPE_STROKE_VARIANTS)[number];

export function normalizeSkeleton(glyph: string): string {
  return String(glyph ?? "").normalize("NFC").trim();
}

export function isShapeSkeletonCorrect(input: {
  expected: string;
  chosen: string;
  /** Stroke-ending tag; ignored for pass/fail when 字体 matches. */
  variant?: ShapeStrokeVariant | null;
}): boolean {
  const expected = normalizeSkeleton(input.expected);
  const chosen = normalizeSkeleton(input.chosen);
  if (!expected || !chosen) return false;
  if (chosen === expected) return true;
  void input.variant;
  return false;
}
