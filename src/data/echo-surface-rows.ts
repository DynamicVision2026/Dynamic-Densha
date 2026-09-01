/** Compact row helper for editorial echo surfaces. */

export type SurfaceRow = {
  id?: string;
  text: string;
  reading: string;
  kana?: string;
  meaningJa?: string;
  frame?: string;
  kind?: "word" | "same_word_new_frame";
  used_for_lights?: Array<"reading" | "meaning">;
  targetChar?: string;
  creditsReading?: boolean;
};

const LIGHTS = ["reading", "meaning"] as const;

export function r(
  text: string,
  reading: string,
  kana: string,
  meaningJa: string,
  frame?: string,
  id?: string,
): SurfaceRow {
  return {
    text,
    reading,
    kana,
    meaningJa,
    frame,
    id,
    kind: frame ? "same_word_new_frame" : "word",
    used_for_lights: [...LIGHTS],
    creditsReading: true,
  };
}

/** First surface of a pair is a word even if it has a frame. */
export function w(
  text: string,
  reading: string,
  kana: string,
  meaningJa: string,
  frame?: string,
  id?: string,
): SurfaceRow {
  return {
    text,
    reading,
    kana,
    meaningJa,
    frame,
    id,
    kind: "word",
    used_for_lights: [...LIGHTS],
    creditsReading: true,
  };
}

/**
 * 熟字訓 / irregular-reading word: `reading` names the char's own taught
 * reading for grouping only — this word does not actually pronounce the
 * character that way (明日 is あした, not ミョウ+じつ), so it must never light
 * or test the reading lamp. Meaning-only; never appears in a reading quiz.
 */
export function wIrregular(
  text: string,
  reading: string,
  kana: string,
  meaningJa: string,
  frame?: string,
  id?: string,
): SurfaceRow {
  return {
    text,
    reading,
    kana,
    meaningJa,
    frame,
    id,
    kind: "word",
    used_for_lights: ["meaning"],
    creditsReading: false,
  };
}
