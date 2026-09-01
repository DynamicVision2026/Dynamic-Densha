/** One coupling clack + one 発車ベル per 到着 beat. Never loops. Cap < 2s. */

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

/** Returns a stop fn. Primary CTAs stay live — do not wait on this. */
export function playArrivalBeat(): () => void {
  if (!shouldPlayArrivalSounds({ muted: readRideMuted(), reducedMotion: prefersReducedMotion() })) {
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
  tone(ctx, t0 + 0.16, 880, 0.28, 0.09);
  tone(ctx, t0 + 0.42, 659, 0.55, 0.07);
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