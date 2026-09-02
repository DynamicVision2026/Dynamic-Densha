/**
 * Trial timing (commerce spec §4). Pure and testable — no DB, no clock
 * reads — kept separate from src/lib/server/household.ts (which does both
 * of those) the same way progress-eval.ts is kept separate from
 * server/progress.ts elsewhere in this codebase.
 */

/** JST has no DST — a fixed +9h offset from UTC always lands on its calendar day. */
const JST_OFFSET_MS = 9 * 3600_000;
const DAY_MS = 24 * 3600_000;

/**
 * `days` full JST calendar days after `nowIso`'s own JST calendar day, at
 * 23:59:59.999 JST. "Ten days" means ten calendar days, not 240 hours —
 * a trial started at 23:58 JST still gets a full ten days, not nine hours
 * short of one, which a naive `now + N*24h` offset would produce.
 */
export function trialEndsAtFrom(nowIso: string, days: number): string {
  const nowMs = Date.parse(nowIso);
  const jstNow = nowMs + JST_OFFSET_MS;
  const jstTodayStart = Math.floor(jstNow / DAY_MS) * DAY_MS;
  const jstTargetDayEnd = jstTodayStart + days * DAY_MS + DAY_MS - 1;
  return new Date(jstTargetDayEnd - JST_OFFSET_MS).toISOString();
}
