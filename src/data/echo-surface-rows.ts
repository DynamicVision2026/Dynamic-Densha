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
  };
}
