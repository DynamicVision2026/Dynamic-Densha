/** One coupling clack + one 発車ベル per 到着 beat. Never loops. Cap < 2s.
 * 結合クラック then 発車ベル. Exactly one each. */

export const ARRIVAL_AUDIO_MAX_MS = 1800;
export const MUTE_KEY = "densha.audio.muted.v1";

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function readRideMuted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Spec name. Same flag the speaker writes: densha.audio.muted.v1 */
export function isRideMuted(): boolean {
  return readRideMuted();
}

export function writeRideMuted(muted: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function shouldPlayArrivalSounds(input: {
  muted: boolean;
  reducedMotion: boolean;
}): boolean {
  return !input.muted && !input.reducedMotion;
}

function tone(
  ctx: AudioContext,
  at: number,
  freq: number,
  dur: number,
  gain: number,
  type: OscillatorType = "sine",
) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

/** 結合クラック */
function clack(ctx: AudioContext, at: number) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(180, at);
  osc.frequency.exponentialRampToValueAtTime(70, at + 0.06);
  g.gain.setValueAtTime(0.18, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.07);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(at);
  osc.stop(at + 0.08);
}

/** 発車ベル */
function bell(ctx: AudioContext, at: number) {
  tone(ctx, at, 880, 0.28, 0.09);
  tone(ctx, at + 0.26, 659, 0.55, 0.07);
}

/** Returns a stop fn. Primary CTAs stay live — do not wait on this. */
export function playArrivalBeat(): () => void {
  if (!shouldPlayArrivalSounds({ muted: isRideMuted(), reducedMotion: prefersReducedMotion() })) {
    return () => {};
  }
  if (typeof window === "undefined") return () => {};
  const AC =
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return () => {};
  const ctx = new AC();
  const t0 = ctx.currentTime;
  clack(ctx, t0);
  bell(ctx, t0 + 0.16);
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    window.clearTimeout(cap);
    void ctx.close().catch(() => {});
  };
  const cap = window.setTimeout(stop, ARRIVAL_AUDIO_MAX_MS);
  return stop;
}
