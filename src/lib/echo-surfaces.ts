/**
 * F2 — 字が対象、詞が表面.
 * Status and lights are per kanji (the car). Reading/meaning practice and 再訪
 * prefer a word surface (熟語 / 交ぜ書き) whenever one is published.
 * Echo never switches to a new 訓 via a different word (same-reading only).
 *
 * Echo order: different word, same reading → same word, new frame → any legal surface.
 */
import { getKanji } from "../data/kyoiku.ts";
import { ECHO_SURFACE_TABLE } from "../data/echo-surfaces.ts";
import type { PracticeKind } from "./mastery.ts";
import { foldReading, isElementaryReading, primaryElementaryReading } from "./readings.ts";

export type EchoSurfaceKind = "word" | "same_word_new_frame";

export type EchoSurface = {
  id: string;
  char: string;
  text: string;
  reading: string;
  kana?: string;
  meaningJa?: string;
  frame?: string;
  kind?: EchoSurfaceKind;
  used_for_lights?: Array<"reading" | "meaning">;
};

export function surfaceIdentity(s: { char: string; text: string; frame?: string }): string {
  return s.frame ? `${s.char}:${s.text}:${s.frame}` : `${s.char}:${s.text}`;
}

export function soloSurface(char: string): EchoSurface | null {
  const reading = primaryElementaryReading(char);
  if (!reading || !isElementaryReading(char, reading)) return null;
  const k = getKanji(char);
  return {
    id: `${char}:solo`,
    char,
    text: char,
    reading,
    meaningJa: k?.meaningJa,
    kind: "word",
    used_for_lights: ["reading", "meaning"],
  };
}

export function echoSurfacesFor(char: string): EchoSurface[] {
  const solo = soloSurface(char);
  const extra = (ECHO_SURFACE_TABLE[char] ?? []).map((row) => {
    const chared = { ...row, char };
    return {
      ...chared,
      id: row.id ?? surfaceIdentity(chared),
    };
  });
  const byText = new Map<string, number>();
  for (const s of extra) byText.set(s.text, (byText.get(s.text) ?? 0) + 1);
  const tagged = extra.map((s) => ({
    ...s,
    kind:
      s.kind ??
      (s.frame && (byText.get(s.text) ?? 0) > 1 ? "same_word_new_frame" : "word"),
  }));
  const raw = solo ? [solo, ...tagged.filter((s) => s.id !== solo.id)] : tagged;
  const seen = new Set<string>();
  const out: EchoSurface[] = [];
  for (const s of raw) {
    if (!isElementaryReading(char, s.reading)) continue;
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    out.push(s);
  }
  return out;
}

export function surfaceById(char: string, id: string | undefined | null): EchoSurface | null {
  if (!id) return null;
  return echoSurfacesFor(char).find((s) => s.id === id) ?? null;
}

function usableForKind(s: EchoSurface, kind: PracticeKind): boolean {
  if (kind === "shape") return false;
  if (!s.used_for_lights || s.used_for_lights.length === 0) return true;
  return s.used_for_lights.includes(kind as "reading" | "meaning");
}

/** Word / 熟語 surface — not the bare character gloss. */
export function isWordSurface(s: EchoSurface): boolean {
  return s.text !== s.char || Boolean(s.frame);
}

export function exampleWordSurfaces(char: string): EchoSurface[] {
  return echoSurfacesFor(char).filter(isWordSurface);
}

/** Meaning items attach a word when published; otherwise the solo gloss. */
export function preferredMeaningSurface(char: string): EchoSurface | null {
  const words = exampleWordSurfaces(char).filter((s) => usableForKind(s, "meaning"));
  return words[0] ?? soloSurface(char);
}

export function extraMeaningSurface(char: string): EchoSurface | null {
  const words = exampleWordSurfaces(char).filter((s) => usableForKind(s, "meaning"));
  return words[1] ?? null;
}

function sameReadingPool(all: EchoSurface[], last: EchoSurface | null): EchoSurface[] {
  if (!last) return all;
  const folded = foldReading(last.reading);
  const same = all.filter((s) => foldReading(s.reading) === folded);
  return same.length > 0 ? same : all;
}

/** Same taught reading only. Never せい → う. */
export function selectEchoSurface(input: {
  char: string;
  kind: PracticeKind;
  lastSurfaceId?: string | null;
  seenIds?: string[];
}): EchoSurface | null {
  const { char, kind, lastSurfaceId } = input;
  if (kind === "shape") return soloSurface(char);

  const all = echoSurfacesFor(char).filter((s) => usableForKind(s, kind));
  if (all.length === 0) return soloSurface(char);

  const last = all.find((s) => s.id === lastSurfaceId) ?? surfaceById(char, lastSurfaceId);
  const pool = sameReadingPool(all, last);
  const seen = new Set(input.seenIds ?? []);
  const unused = pool.filter((s) => s.id !== lastSurfaceId && !seen.has(s.id));
  const words = unused.filter(isWordSurface);
  const pickFrom = words.length > 0 ? words : unused;

  const lastText = last?.text ?? char;
  const lastFrame = last?.frame ?? "";
  const differentWord = pickFrom.filter((s) => s.text !== lastText);
  if (differentWord.length > 0) return differentWord[0]!;

  const newFrame = pickFrom.filter(
    (s) => s.text === lastText && (s.frame ?? "") !== lastFrame,
  );
  if (newFrame.length > 0) return newFrame[0]!;

  if (pickFrom.length > 0) return pickFrom[0]!;
  return last ?? pool[0] ?? soloSurface(char);
}

export function isLegalEchoTransition(char: string, fromId: string, toId: string): boolean {
  const from = surfaceById(char, fromId);
  const to = surfaceById(char, toId);
  if (!from || !to) return false;
  if (!isElementaryReading(char, to.reading)) return false;
  return foldReading(from.reading) === foldReading(to.reading);
}

/** Dual 再訪 bundle: ≥2 echo entries that share one taught reading. */
export function hasEchoBundle(char: string): boolean {
  const words = exampleWordSurfaces(char);
  if (words.length < 1) return false;
  const byReading = new Map<string, Set<string>>();
  for (const s of words) {
    const key = foldReading(s.reading);
    const set = byReading.get(key) ?? new Set();
    set.add(surfaceIdentity(s));
    byReading.set(key, set);
  }
  return [...byReading.values()].some((set) => set.size >= 2);
}
