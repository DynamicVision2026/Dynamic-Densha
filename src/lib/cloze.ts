import { CLOZE_SELECT, type ClozeDraft } from "../data/cloze-select.ts";
import { getKanji } from "../data/kyoiku.ts";
import { decoyFor } from "./confusable.ts";
import type { Quiz } from "./quiz.ts";

export const CLOZE_VARIANT = 81;

function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function shuffle<T>(items: T[], seed: string): T[] {
  const a = [...items];
  let h = hash(seed);
  for (let i = a.length - 1; i > 0; i--) {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    const j = h % (i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function clozeFor(kanji: string): ClozeDraft | null {
  return CLOZE_SELECT[kanji] ?? null;
}

export function buildClozeQuiz(kanji: string): Quiz | null {
  const draft = clozeFor(kanji);
  const k = getKanji(kanji);
  if (!draft || !k) return null;
  const labels = Array.from(new Set([draft.answer, ...draft.choices])).slice(0, 4);
  if (!labels.includes(kanji)) return null;
  const choices = shuffle(
    labels.map((label, i) => ({
      id: `z${i}-${label}`,
      label,
      correct: label === kanji,
    })),
    `${kanji}|cloze`,
  );
  return {
    kind: "shape",
    prompt: draft.frame_ja,
    hint: "文の中の 字",
    glyph: kanji,
    imagery: k.imagery,
    choices,
    cloze: {
      frame_ja: draft.frame_ja,
      answer: kanji,
      primary_light: "shape",
      gentle: Boolean(decoyFor(kanji)) || draft.choices.some((c) => c !== kanji && decoyFor(kanji) === c),
    },
  };
}
