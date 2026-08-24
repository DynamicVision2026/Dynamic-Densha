import { CONFUSABLE_PAIRS, type ConfusablePair } from "../data/confusable.ts";
import { getKanji } from "../data/kyoiku.ts";
import type { Quiz } from "./quiz.ts";

export const CONFUSABLE_VARIANT = 90;

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

export function pairFor(kanji: string): ConfusablePair | null {
  return CONFUSABLE_PAIRS.find((p) => p.a === kanji || p.b === kanji) ?? null;
}

export function decoyFor(kanji: string): string | null {
  const pair = pairFor(kanji);
  if (!pair) return null;
  return pair.a === kanji ? pair.b : pair.a;
}

export function pairPlayable(pair: ConfusablePair, childGrade: number): boolean {
  const ga = getKanji(pair.a)?.grade ?? 99;
  const gb = getKanji(pair.b)?.grade ?? 99;
  return ga <= childGrade || gb <= childGrade;
}

export function pairsForGrade(childGrade: number): Array<ConfusablePair & { playable: boolean }> {
  return CONFUSABLE_PAIRS.map((pair) => ({
    ...pair,
    playable: pairPlayable(pair, childGrade),
  }));
}

export function buildConfusableQuiz(kanji: string): Quiz | null {
  const pair = pairFor(kanji);
  const k = getKanji(kanji);
  if (!pair || !k) return null;
  const decoy = pair.a === kanji ? pair.b : pair.a;
  const prompt = pair.a === kanji ? pair.prompt_a : pair.prompt_b;
  const choices = shuffle(
    [
      { id: "c-target", label: kanji, correct: true },
      { id: "c-decoy", label: decoy, correct: false },
    ],
    `${kanji}|confusable`,
  );
  return {
    kind: "shape",
    prompt,
    hint: "乗り間違い注意",
    glyph: kanji,
    imagery: k.imagery,
    choices,
    confusable: { target: kanji, decoy, prompt_ja: prompt },
  };
}
