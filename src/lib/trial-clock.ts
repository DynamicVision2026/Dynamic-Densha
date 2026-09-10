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

/**
 * "Trial ends {month} {day}" in the parent's own locale, on the Asia/Tokyo
 * calendar day trialEndsAtFrom() targeted -- Intl.DateTimeFormat handles
 * per-locale month/day ordering and script (ja/zh "9月14日" vs en
 * "September 14") so this doesn't need four hand-written formatters.
 */
export function trialEndDateLabel(trialEndsAtIso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Tokyo",
    month: "long",
    day: "numeric",
  }).format(new Date(trialEndsAtIso));
}

/**
 * Same idea as trialEndDateLabel, but always includes the year -- for a
 * date that can land a full year or more out (an annual pass's paid_until),
 * where the month/day alone is genuinely ambiguous: a household's trial
 * end and its annual pass's paid_until routinely fall on the exact same
 * calendar day a year apart (the stacking rule in subscription-derive.ts
 * extends paid_until from effectiveTrialEnd itself when purchased during
 * the trial), so "9月20日" alone can't tell a parent which one they're
 * looking at. Never use trialEndDateLabel for a date this far out.
 */
export function dateWithYearLabel(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(iso));
}
