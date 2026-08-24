import { KANJI_LINES } from "../data/lines.ts";
import { PHONETIC_FAMILIES } from "../data/phonetic-families.ts";
import { familyFor } from "./phonetic-family.ts";
import { primaryLineFor } from "./lines.ts";
import type { ProgressState } from "./progress-eval.ts";

export type WeekPeek = {
  kind: "line" | "family";
  id: string;
  label: string;
  why: string;
  kanji: string;
};

function metChars(
  progress: Map<string, ProgressState> | Record<string, ProgressState>,
): string[] {
  const rows = progress instanceof Map ? [...progress.values()] : Object.values(progress);
  return rows
    .filter((row) => row.status && row.status !== "new")
    .sort((a, b) => {
      const ta = Date.parse(a.lastPracticeAt ?? a.seenAt ?? "0");
      const tb = Date.parse(b.lastPracticeAt ?? b.seenAt ?? "0");
      return tb - ta;
    })
    .map((row) => row.kanji);
}

/**
 * One look-ahead card. Prefer a line the child has already boarded,
 * else a 音の家族, else the first editorial line that has a station in-grade.
 * Opening it does not write progress.
 */
export function pickWeekPeek(input: {
  progress: Map<string, ProgressState> | Record<string, ProgressState>;
  grade: number;
}): WeekPeek | null {
  const met = metChars(input.progress);
  for (const kanji of met) {
    const line = primaryLineFor(kanji);
    if (line) {
      return {
        kind: "line",
        id: line.id,
        label: line.label_ja,
        why: line.why,
        kanji,
      };
    }
  }
  for (const kanji of met) {
    const family = familyFor(kanji);
    if (family) {
      return {
        kind: "family",
        id: family.id,
        label: family.label_ja,
        why: family.why,
        kanji,
      };
    }
  }
  const line =
    KANJI_LINES.find((l) => l.stations.some((s) => s.grade === input.grade)) ?? KANJI_LINES[0];
  if (!line) return null;
  const station = line.stations.find((s) => s.grade === input.grade) ?? line.stations[0];
  if (!station) return null;
  return {
    kind: "line",
    id: line.id,
    label: line.label_ja,
    why: line.why,
    kanji: station.kanji,
  };
}

export function peekFamily(id: string) {
  return PHONETIC_FAMILIES.find((f) => f.id === id) ?? null;
}
