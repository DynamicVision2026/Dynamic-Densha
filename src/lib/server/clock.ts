/**
 * The single seam through which the mastery/echo evaluation path obtains
 * "now". Production code always resolves to systemClock; nothing else is
 * constructible while `NODE_ENV=production` (see createTestClock below).
 *
 * This is orthogonal to 30510fa's P0-1 boundary, not a reopening of it: that
 * fix established that the CLIENT may never supply time (scoring reads
 * stored `echoDueAt` + a server-generated now, never a request field). This
 * module only changes where the SERVER's own now comes from, so a test can
 * drive it in milliseconds instead of waiting out real 20h/168h delays. No
 * request of any kind reaches this file -- see check-clock-single-source.mjs
 * and scripts/clock.test.ts, which pin both invariants.
 */

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

export interface TestClock extends Clock {
  set(at: string | Date): void;
  advanceHours(hours: number): void;
}

/**
 * A clock a test can move by hand. The only thing gating this from being a
 * live time-travel backdoor is that it throws outside non-production --
 * there is no code path from any request to this function at all, and this
 * check is the second, independent layer behind that: even a caller that
 * somehow reached it in a deployed process gets a thrown error, never a
 * controllable clock.
 */
export function createTestClock(startAt: string | Date): TestClock {
  if (process.env.NODE_ENV === "production") {
    throw new Error("createTestClock: refused because NODE_ENV=production");
  }
  let current = typeof startAt === "string" ? new Date(startAt) : startAt;
  return {
    now: () => current,
    set(at) {
      current = typeof at === "string" ? new Date(at) : at;
    },
    advanceHours(hours) {
      current = new Date(current.getTime() + hours * 3600_000);
    },
  };
}
