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
  /** Glyph in the word being taught (花 in 花火). Content field, not U2. */
  targetChar: string;
  /** This face may light the よみ lamp. Content field, not U2. */
  creditsReading: boolean;
};

export function surfaceIdentity(s: { char: string; text: string; frame?: string }): string {
  return s.frame ? `${s.char}:${s.text}:${s.frame}` : `${s.char}:${s.text}`;
}

function creditsReadingFromLights(
  used?: Array<"reading" | "meaning">,
  explicit?: boolean,
): boolean {
  if (typeof explicit === "boolean") return explicit;
  if (!used || used.length === 0) return true;
  return used.includes("reading");
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
    targetChar: char,
    creditsReading: true,
  };
}

export function echoSurfacesFor(char: string): EchoSurface[] {
  const solo = soloSurface(char);
  const extra = (ECHO_SURFACE_TABLE[char] ?? []).map((row) => {
    const chared = { ...row, char };
    const used = row.used_for_lights;
    return {
      ...chared,
      id: row.id ?? surfaceIdentity(chared),
      targetChar: row.targetChar ?? char,
      creditsReading: creditsReadingFromLights(used, row.creditsReading),
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

function pickFromPool(
  pool: EchoSurface[],
  last: EchoSurface | null | undefined,
  lastSurfaceId: string | null | undefined,
  seen: Set<string>,
): EchoSurface | null {
  const unused = pool.filter((s) => s.id !== lastSurfaceId && !seen.has(s.id));
  const words = unused.filter(isWordSurface);
  const pickFrom = words.length > 0 ? words : unused;

  const lastText = last?.text ?? "";
  const lastFrame = last?.frame ?? "";
  const differentWord = pickFrom.filter((s) => s.text !== lastText);
  if (differentWord.length > 0) return differentWord[0]!;

  const newFrame = pickFrom.filter(
    (s) => s.text === lastText && (s.frame ?? "") !== lastFrame,
  );
  if (newFrame.length > 0) return newFrame[0]!;

  return pickFrom.length > 0 ? pickFrom[0]! : null;
}

/**
 * Same taught reading preferred. Never せい → う.
 * Never returns `lastSurfaceId` itself when any other legal surface for this
 * kanji+kind exists — a same-reading pool of one (just the last draw) widens
 * to any legal surface rather than handing the child the identical item twice.
 */
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
  const seen = new Set(input.seenIds ?? []);

  const pool = sameReadingPool(all, last);
  const fromSameReading = pickFromPool(pool, last, lastSurfaceId, seen);
  if (fromSameReading) return fromSameReading;

  // The same-reading pool had nothing to offer beyond the last-drawn surface
  // itself. Widen to any legal surface for this kanji+kind rather than repeat it.
  const fromAny = pickFromPool(all, last, lastSurfaceId, seen);
  if (fromAny) return fromAny;

  // `all` itself has nothing but `last` to offer: this kanji+kind has exactly
  // one legal surface in total, so there is no variation left to fall back to
  // and this genuinely does repeat it. Content, not a selection bug — see
  // hasEchoBundle's doc comment and the 媛/達 exemption in scale-g4.test.ts,
  // the only two characters this applies to (onyomi-only, no elementary kun,
  // no elementary-level second word to build a reading surface from).
  return last ?? pool[0] ?? soloSurface(char);
}

export function isLegalEchoTransition(char: string, fromId: string, toId: string): boolean {
  const from = surfaceById(char, fromId);
  const to = surfaceById(char, toId);
  if (!from || !to) return false;
  if (!isElementaryReading(char, to.reading)) return false;
  return foldReading(from.reading) === foldReading(to.reading);
}

/**
 * Dual 再訪 bundle: true only when `selectEchoSurface` can never be forced to
 * repeat a given starting surface for this kanji — checked by actually
 * simulating every legal reading/meaning starting draw through the real
 * selection function, not by an aggregate reading-coverage count (which can
 * report "clean" while a specific starting surface still has no alternative).
 *
 * Returns false for a kanji whose only taught reading has no elementary-level
 * word to pair it with — e.g. 媛/達, onyomi-only with no elementary kunyomi
 * and no elementary-level second word, so the bare solo character is the one
 * and only legal reading surface. `selectEchoSurface` has nothing to widen to
 * there and does repeat it; that is content, not a selection bug (see its own
 * comment). Exempted explicitly, by name, in scale-g4.test.ts rather than
 * silently excluded here.
 */
export function hasEchoBundle(char: string): boolean {
  for (const kind of ["reading", "meaning"] as const) {
    const surfaces = echoSurfacesFor(char).filter((s) => usableForKind(s, kind));
    for (const start of surfaces) {
      const next = selectEchoSurface({
        char,
        kind,
        lastSurfaceId: start.id,
        seenIds: [start.id],
      });
      if (!next || next.id === start.id) return false;
    }
  }
  return true;
}
