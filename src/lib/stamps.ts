import { linesContaining } from "./lines.ts";
import type { ProgressState } from "./progress-eval.ts";

export type Stamp = {
  kanji: string;
  perfect_at: string;
  line_ids?: string[];
};

export function stampFromPerfect(state: ProgressState): Stamp {
  return {
    kanji: state.kanji,
    perfect_at: state.perfectAt ?? new Date().toISOString(),
    line_ids: linesContaining(state.kanji).map((l) => l.id),
  };
}

/** First perfect only. Later echoes and decay never duplicate or remove. */
export function mergeStamp(existing: Stamp[], next: Stamp): Stamp[] {
  if (existing.some((s) => s.kanji === next.kanji)) return existing;
  return [next, ...existing];
}

export function justReachedPerfect(prev: ProgressState | undefined, next: ProgressState): boolean {
  if (next.status !== "perfect") return false;
  if (!prev) return true;
  return prev.status !== "perfect";
}
