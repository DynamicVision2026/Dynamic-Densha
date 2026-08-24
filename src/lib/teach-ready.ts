/**
 * F4 — per-kanji “thick teaching complete”.
 * Computed from locked content. Never split/generated live on the child path.
 *
 * teach_ready === true  → may appear in normal new-station recommendations
 * teach_ready === false → omitted from parent “of grade” denominators
 */
import { getKanji, KYOIKU } from "../data/kyoiku.ts";
import { isBakedReading } from "../data/reading-audio.ts";
import { exampleWordSurfaces } from "./echo-surfaces.ts";
import { hasEncounter } from "./encounters.ts";
import { elementaryReadingsOf } from "./readings.ts";

export const TEACH_READY_ITEMS = [
  "readings",
  "audio",
  "meaning",
  "word_surface",
  "shape_ok",
  "imagery",
] as const;

export type TeachReadyItem = (typeof TEACH_READY_ITEMS)[number];

export type TeachReadyReport = {
  char: string;
  teach_ready: boolean;
  fails: TeachReadyItem[];
  checks: Record<TeachReadyItem, boolean>;
};

function hasFixedAudioFor(char: string): boolean {
  const r = elementaryReadingsOf(char);
  const listed = [...r.onyomi, ...r.kunyomi]
    .map((t) => String(t).normalize("NFKC").trim())
    .filter(Boolean);
  if (listed.length === 0) return false;
  return listed.every((t) => isBakedReading(t));
}

export function teachReadyReport(char: string): TeachReadyReport {
  const k = getKanji(char);
  const r = elementaryReadingsOf(char);
  const readings = [...r.onyomi, ...r.kunyomi].some((x) => x.trim());
  const audio = hasFixedAudioFor(char);
  const meaning = Boolean(k?.meaningJa?.trim());
  const word = exampleWordSurfaces(char).length > 0;
  const imagery = hasEncounter(char);
  const checks: Record<TeachReadyItem, boolean> = {
    readings,
    audio,
    meaning,
    word_surface: word,
    shape_ok: true,
    imagery,
  };
  const fails = TEACH_READY_ITEMS.filter((id) => !checks[id]);
  return { char, teach_ready: fails.length === 0, fails, checks };
}

export function isTeachReady(char: string): boolean {
  return teachReadyReport(char).teach_ready;
}

export function teachReadyChars(grade: number): string[] {
  return KYOIKU.filter((k) => k.grade === grade && isTeachReady(k.char)).map((k) => k.char);
}
