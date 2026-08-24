import { exampleWordSurfaces } from "./echo-surfaces.ts";
import { primaryLineFor } from "./lines.ts";
import type { PracticeKind } from "./mastery.ts";
import { familyFor } from "./phonetic-family.ts";
import type { ReportEvent } from "./parent-report.ts";
import { structureConfirm } from "./shape-copy.ts";

const WEEK_MS = 7 * 24 * 3600_000;
const TAUGHT_MAX = 6;

export type TaughtItem = {
  kanji: string;
  kind: PracticeKind | string;
  word?: string;
  structure?: string;
  lineLabel?: string;
  familyLabel?: string;
};

function inWeek(iso: string | null | undefined, since: number): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && t >= since;
}

function taughtWord(kanji: string): string | undefined {
  const words = exampleWordSurfaces(kanji);
  const prefer = words.find((s) => s.text !== kanji);
  const text = prefer?.text ?? words[0]?.text;
  return text && text !== kanji ? text : undefined;
}

/** Facts from stored events only. Empty week → no invented rides. */
export function taughtThisWeek(
  events: ReportEvent[],
  nowIso = new Date().toISOString(),
): TaughtItem[] {
  const since = Date.parse(nowIso) - WEEK_MS;
  const week = events
    .filter((e) => inWeek(e.created_at, since))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const out: TaughtItem[] = [];
  const seen = new Set<string>();
  for (const ev of week) {
    if (seen.has(ev.kanji)) continue;
    seen.add(ev.kanji);
    const line = primaryLineFor(ev.kanji);
    const family = familyFor(ev.kanji);
    out.push({
      kanji: ev.kanji,
      kind: ev.kind,
      word: taughtWord(ev.kanji),
      structure: ev.kind === "shape" ? structureConfirm(ev.kanji) ?? undefined : undefined,
      lineLabel: line?.label_ja,
      familyLabel: family?.label_ja,
    });
    if (out.length >= TAUGHT_MAX) break;
  }
  return out;
}
