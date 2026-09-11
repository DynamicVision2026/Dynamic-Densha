/**
 * The annual pass covers one child. This is the pure part of moving it:
 * when a reassignment is allowed, and what the parent surface should say
 * while it isn't.
 *
 * Alias-free (no `@/` imports) so the plain node test runner can exercise
 * the date arithmetic directly -- the same split admin-gate.ts,
 * checkout-poll.ts and commerce-copy.ts already use here.
 */

/**
 * Thirty days between reassignments. The number is a product decision, not
 * a technical one: it is long enough that the pass is not a nightly
 * bargaining chip between siblings, and short enough that a family whose
 * circumstances actually changed is not stuck for a year.
 */
export const PASS_REASSIGN_COOLDOWN_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export type CooldownState =
  | { blocked: false; nextAllowedAt: null }
  | { blocked: true; nextAllowedAt: string };

/**
 * Whether the pass may be moved right now.
 *
 * `coveredAssignedAt === null` means this household has never assigned the
 * pass, and the FIRST assignment is exempt -- a parent who has just paid
 * must be able to choose immediately. Without that exemption the cooldown
 * would lock a freshly bought pass to whichever child was picked in the
 * same breath as the purchase, which is the one moment a mistake is most
 * likely.
 *
 * An unparseable timestamp is treated as "no cooldown" rather than as an
 * indefinite block: the failure mode of guessing wrong in that direction is
 * one extra reassignment, and the other direction is a family locked out of
 * their own pass by a bad row.
 */
export function cooldownStateOf(coveredAssignedAt: string | null, nowIso: string): CooldownState {
  if (!coveredAssignedAt) return { blocked: false, nextAllowedAt: null };
  const assigned = Date.parse(coveredAssignedAt);
  const now = Date.parse(nowIso);
  if (!Number.isFinite(assigned) || !Number.isFinite(now)) return { blocked: false, nextAllowedAt: null };
  const nextAllowed = assigned + PASS_REASSIGN_COOLDOWN_DAYS * DAY_MS;
  if (now >= nextAllowed) return { blocked: false, nextAllowedAt: null };
  return { blocked: true, nextAllowedAt: new Date(nextAllowed).toISOString() };
}
