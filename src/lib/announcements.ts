import { BAKED_ANNOUNCE_IDS } from "../data/announce-baked.ts";
import { ANNOUNCEMENTS_G1, type Announcement } from "../data/announcements.ts";
import { ANNOUNCEMENTS_G2G6 } from "../data/announcements-g2g6.ts";
import { getKanji, KYOIKU } from "../data/kyoiku.ts";
import { lookupReadingAudio } from "../data/reading-audio.ts";

const LAST_STATION_KEY = "densha.lastStation";
const BAKED = new Set<string>(BAKED_ANNOUNCE_IDS);

/** Editorial G1 first, then rule-built G2–G6. One row per station. */
export const ALL_ANNOUNCEMENTS: Announcement[] = [...ANNOUNCEMENTS_G1, ...ANNOUNCEMENTS_G2G6];

const BY_KANJI = new Map<string, Announcement>();
for (const a of ANNOUNCEMENTS_G2G6) BY_KANJI.set(a.kanji, a);
for (const a of ANNOUNCEMENTS_G1) BY_KANJI.set(a.kanji, a);

export const ANNOUNCE_CHIME = "/announce/_chime.mp3";
export const ANNOUNCE_TSUGIWA = "/announce/_tsugiwa.mp3";
export const ANNOUNCE_DESU = "/announce/_desu.mp3";

function kataToHira(s: string): string {
  return [...s]
    .map((ch) => {
      const c = ch.charCodeAt(0);
      if (c >= 0x30a1 && c <= 0x30f6) return String.fromCharCode(c - 0x60);
      return ch;
    })
    .join("");
}

function readingHint(kanji: string): string {
  const k = getKanji(kanji);
  if (!k) return "";
  return k.elementaryReadings.kunyomi[0] ?? k.kun[0] ?? k.elementaryReadings.onyomi[0] ?? k.on[0] ?? "";
}

/** Filename id for a generic (non-熟語) station clip. One kanji → one id. */
export function genericAnnounceId(kanji: string): string {
  return `g-${(kanji.codePointAt(0) ?? 0).toString(16)}`;
}

/** Screen copy and spoken copy are the same field. Never rewrite. */
export function spokenLineFor(a: Announcement): string {
  return a.text;
}

/** Static clip baked at build time. Missing id → caller may use glue clips. */
export function announcementAudioSrc(a: Announcement): string | null {
  if (!a.id || a.id.startsWith("generic:")) return null;
  if (!BAKED.has(a.id)) return null;
  return `/announce/${a.id}.mp3`;
}

/**
 * Playable clips for this station. Dedicated file when baked.
 * Emergency only: chime + 「次は、」+ elementary reading + 「です。」
 * Never reuses another station's 熟語.
 */
export function announcementAudioClips(a: Announcement): string[] {
  const src = announcementAudioSrc(a);
  if (src) return [src];
  const clips = [ANNOUNCE_CHIME, ANNOUNCE_TSUGIWA];
  const reading = lookupReadingAudio(readingHint(a.kanji));
  if (reading?.url) clips.push(reading.url);
  clips.push(ANNOUNCE_DESU);
  return clips;
}

function genericAnnouncement(kanji: string): Announcement {
  const reading = kataToHira(readingHint(kanji));
  const bakedId = genericAnnounceId(kanji);
  return {
    id: BAKED.has(bakedId) ? bakedId : `generic:${kanji}`,
    kanji,
    text: reading ? `次は、${reading}です。` : `次は、「${kanji}」です。`,
    reading,
  };
}

/** G1 stations still on the reading template. Empty after 80/80. */
export function g1AnnounceTemplateGaps(): string[] {
  return KYOIKU.filter((k) => k.grade === 1 && !BY_KANJI.has(k.char)).map((k) => k.char);
}

export type AnnounceGradeCoverage = {
  grade: number;
  total: number;
  dedicated: number;
  gaps: string[];
};

/** Per-grade dedicated-line + baked-file coverage for 配当. */
export function announceCoverageByGrade(): AnnounceGradeCoverage[] {
  return [1, 2, 3, 4, 5, 6].map((grade) => {
    const chars = KYOIKU.filter((k) => k.grade === grade).map((k) => k.char);
    const gaps: string[] = [];
    let dedicated = 0;
    for (const c of chars) {
      const a = announcementFor(c);
      const src = announcementAudioSrc(a);
      if (src && BY_KANJI.has(c)) dedicated += 1;
      else gaps.push(c);
    }
    return { grade, total: chars.length, dedicated, gaps };
  });
}

/**
 * Announcement for the station being boarded.
 * Lookup is strictly by current kanji. Never hash / index / reuse another station.
 */
export function announcementFor(kanji: string): Announcement {
  const named = BY_KANJI.get(kanji);
  if (named) return named;
  return genericAnnouncement(kanji);
}

export function readLastStation(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(LAST_STATION_KEY);
  } catch {
    return null;
  }
}

export function writeLastStation(kanji: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(LAST_STATION_KEY, kanji);
  } catch {
    /* ignore */
  }
}

/**
 * Announcement product lock (2026-08-25):
 *   shouldAnnounce = !isEcho && !isAutoDemoTour && station changed
 * - 残響 / みてみる / scripted auto-demo: silent
 * - Normal /demo and /app station teach entry (including なおし re-entry): may announce
 * Do not mute all `/demo/*`.
 */
export function shouldAnnounce(
  kanji: string,
  opts: { lookMode: boolean; echoOn: boolean; echoDue?: boolean; demoActive?: boolean },
): boolean {
  if (opts.lookMode || opts.echoOn || opts.echoDue || opts.demoActive) return false;
  return readLastStation() !== kanji;
}
