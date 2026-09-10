/**
 * The polling schedule /subscribe/success runs while it waits for the
 * Shopify webhook to land, and the view state that goes with it. Pure: no
 * clock of its own, no React, no `@/` aliases -- it takes an elapsed
 * duration and answers two questions, so both are unit-testable
 * (scripts/checkout-poll.test.ts) rather than only observable by sitting in
 * front of the real screen for five minutes.
 *
 * Deliberately wider than the 30s window /app/parent's own post-checkout
 * poll uses. Card payments confirm in seconds, but KOMOJU PayPay can fire
 * `orders/paid` only on settlement, which means "slow" is the NORMAL case
 * for that method -- the copy that goes with the slow state must therefore
 * read as "still working", never as a failure.
 */

export const FAST_INTERVAL_MS = 2_000;
export const FAST_WINDOW_MS = 30_000;
export const SLOW_INTERVAL_MS = 10_000;
export const POLL_CEILING_MS = 300_000;

export type SuccessView = "pending" | "confirmed" | "slow";

/**
 * `false` means stop polling -- either entitlement already landed, or five
 * minutes have passed and the screen switches to a manual reload rather
 * than spinning forever against a webhook that may need a human to chase.
 */
export function pollIntervalMs(input: { active: boolean; elapsedMs: number }): number | false {
  if (input.active) return false;
  if (input.elapsedMs < FAST_WINDOW_MS) return FAST_INTERVAL_MS;
  if (input.elapsedMs < POLL_CEILING_MS) return SLOW_INTERVAL_MS;
  return false;
}

/**
 * Three states, no error state (spec §1.3): a webhook that hasn't arrived
 * yet is not a failure, and nothing this screen can observe distinguishes
 * "slow" from "failed" anyway.
 *
 * The slow state starts at the end of the FAST window, not at the polling
 * ceiling -- a parent watching a spinner for four and a half minutes with
 * no explanation is the thing being avoided. Polling quietly continues
 * behind it (every SLOW_INTERVAL_MS) until POLL_CEILING_MS, so a pass that
 * lands at 90 seconds still appears on its own.
 */
export function successView(input: { active: boolean; elapsedMs: number }): SuccessView {
  if (input.active) return "confirmed";
  return input.elapsedMs < FAST_WINDOW_MS ? "pending" : "slow";
}
