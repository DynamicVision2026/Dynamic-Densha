/** Last-seen かんぺき consist on child home. First install = no glow. */

export const CONSIST_SEEN_KEY = "densha.consist.seen.v1";
export const RETURN_GLOW_MS = 1000;

export function perfectConsist(cars: { char: string; status: string }[]): string[] {
  return cars
    .filter((c) => c.status === "perfect")
    .map((c) => c.char)
    .sort();
}

export function readConsistSeen(): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CONSIST_SEEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed.map(String).sort();
  } catch {
    return null;
  }
}

export function writeConsistSeen(glyphs: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CONSIST_SEEN_KEY, JSON.stringify([...glyphs].sort()));
  } catch {
    /* ignore */
  }
}

export function newPerfectGlyphs(consist: string[], snapshot: string[] | null): string[] {
  if (!snapshot || snapshot.length === 0) return [];
  const seen = new Set(snapshot);
  return consist.filter((g) => !seen.has(g));
}

export function planReturnMoment(input: {
  consist: string[];
  snapshot: string[] | null;
  reducedMotion: boolean;
}): { glow: string[]; holdMs: number; nextSnapshot: string[] } {
  const nextSnapshot = [...input.consist].sort();
  if (input.reducedMotion) {
    return { glow: [], holdMs: 0, nextSnapshot };
  }
  const glow = newPerfectGlyphs(nextSnapshot, input.snapshot);
  if (glow.length === 0) return { glow: [], holdMs: 0, nextSnapshot };
  return { glow, holdMs: RETURN_GLOW_MS, nextSnapshot };
}