import { getKanji, type ElementaryReadings } from "../data/kyoiku.ts";
import { stageReadingsOf } from "../data/onkun-stage.ts";

/**
 * Spec v0.2 Part C — reading-light correctness and Understand-beat display
 * consume `kanji.elementaryReadings` as the single source of truth.
 * Source: 音訓の小・中・高等学校段階別割り振り表（平成29年3月）小学校 column.
 */

export type { ElementaryReadings };

const EMPTY: ElementaryReadings = { onyomi: [], kunyomi: [] };

function unique(xs: string[]): string[] {
  return Array.from(new Set(xs));
}

/** Fold 音 (katakana) and 訓 (hiragana) so バク and ばく compare equal. */
export function foldReading(raw: string): string {
  return Array.from(String(raw ?? "").normalize("NFKC").trim())
    .map((ch) => {
      const c = ch.codePointAt(0) ?? 0;
      if (c >= 0x30a1 && c <= 0x30f6) return String.fromCodePoint(c - 0x60);
      return ch;
    })
    .join("")
    .replace(/[.\s　・‧\-]/g, "");
}

/** The content field. Never falls back to the dictionary on/kun lists. */
export function elementaryReadingsOf(char: string): ElementaryReadings {
  return getKanji(char)?.elementaryReadings ?? EMPTY;
}

export function elementaryReadings(char: string): string[] {
  const r = elementaryReadingsOf(char);
  return unique([...r.onyomi, ...r.kunyomi]);
}

export function laterStageReadings(char: string): string[] {
  const stage = stageReadingsOf(char);
  if (!stage) return [];
  return unique([...stage.juniorHigh, ...stage.highSchool]);
}

export function isElementaryReading(char: string, reading: string): boolean {
  const folded = foldReading(reading);
  if (!folded) return false;
  const r = elementaryReadingsOf(char);
  return [...r.onyomi, ...r.kunyomi].some((x) => foldReading(x) === folded);
}

export function elementaryOnYomi(char: string): string[] {
  return [...elementaryReadingsOf(char).onyomi];
}

export function elementaryKunYomi(char: string): string[] {
  return [...elementaryReadingsOf(char).kunyomi];
}

/** Preferred quiz stem: 訓 first (child-friendly), else 音. */
export function primaryElementaryReading(char: string): string | null {
  const r = elementaryReadingsOf(char);
  return r.kunyomi[0] ?? r.onyomi[0] ?? null;
}
