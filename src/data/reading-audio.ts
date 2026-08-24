import { KYOIKU } from "./kyoiku.ts";
import { FAMILY_READINGS } from "../lib/phonetic-family.ts";
import { hasEchoBundle } from "../lib/echo-surfaces.ts";
import { BAKED_READING_TEXTS } from "./reading-audio-baked.ts";

export type AudioKind = "onyomi" | "kunyomi" | "word" | "announcement";

export type AudioManifestEntry = {
  key: string;
  text: string;
  url: string;
  kind: AudioKind;
  locale?: "ja";
};

const BAKED = new Set<string>(BAKED_READING_TEXTS);

function isKanaOn(text: string): boolean {
  return /[\u30a1-\u30f6]/.test(text);
}

function norm(text: string): string {
  return String(text ?? "").normalize("NFKC").trim();
}

/** Stable filename from the exact UI string (所听即所见). */
export function readingSlug(text: string): string {
  const raw = norm(text);
  if (!raw) return "";
  return [...raw].map((ch) => (ch.codePointAt(0) ?? 0).toString(16).padStart(4, "0")).join("");
}

export function readingAudioKey(text: string): string {
  return `reading:${norm(text)}`;
}

export function readingAudioUrl(text: string): string | null {
  const slug = readingSlug(text);
  if (!slug) return null;
  return `/audio/readings/${slug}.mp3`;
}

export function isBakedReading(text: string): boolean {
  return BAKED.has(norm(text));
}

function addReading(
  seen: Map<string, AudioManifestEntry>,
  text: string,
  kind: AudioKind,
) {
  const t = norm(text);
  if (!t || seen.has(t)) return;
  const url = readingAudioUrl(t);
  if (!url) return;
  seen.set(t, {
    key: readingAudioKey(t),
    text: t,
    url,
    kind,
    locale: "ja",
  });
}

export function collectTeachableReadings(maxGrade = 1): AudioManifestEntry[] {
  const seen = new Map<string, AudioManifestEntry>();
  for (const k of KYOIKU) {
    if (k.grade > maxGrade) continue;
    for (const r of k.elementaryReadings.onyomi) addReading(seen, r, "onyomi");
    for (const r of k.elementaryReadings.kunyomi) addReading(seen, r, "kunyomi");
  }
  for (const r of FAMILY_READINGS) addReading(seen, r, isKanaOn(r) ? "onyomi" : "kunyomi");
  return [...seen.values()];
}

/** G1 all + G2–G6 current learning-package characters. */
export function collectLearningPackageReadings(): AudioManifestEntry[] {
  const seen = new Map<string, AudioManifestEntry>();
  for (const k of KYOIKU) {
    if (k.grade !== 1 && !hasEchoBundle(k.char)) continue;
    for (const r of k.elementaryReadings.onyomi) addReading(seen, r, "onyomi");
    for (const r of k.elementaryReadings.kunyomi) addReading(seen, r, "kunyomi");
  }
  for (const r of FAMILY_READINGS) addReading(seen, r, isKanaOn(r) ? "onyomi" : "kunyomi");
  return [...seen.values()];
}

export function lookupReadingAudio(text: string): AudioManifestEntry | null {
  const t = norm(text);
  if (!t || !BAKED.has(t)) return null;
  const url = readingAudioUrl(t);
  if (!url) return null;
  return {
    key: readingAudioKey(t),
    text: t,
    url,
    kind: isKanaOn(t) ? "onyomi" : "kunyomi",
    locale: "ja",
  };
}
