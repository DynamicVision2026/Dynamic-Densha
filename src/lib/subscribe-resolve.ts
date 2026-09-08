/**
 * The pure decision core of src/routes/subscribe.ts, split out the same way
 * stripe-signature.ts and stripe-plan.ts are split from their own route/DB
 * glue: this file touches no DB, no request, no cookies, so the plain node
 * test runner can exercise every branch directly (see
 * scripts/subscribe-resolve.test.ts) without Vite's `@/` path aliasing.
 *
 * The route itself does the actual work each branch implies (creating a
 * household, minting a checkout_token, building the Stripe URL) -- this
 * function only decides WHICH of the five branches applies, given inputs
 * the route has already resolved (a parsed plan, whether there's a
 * session, whether the household is already 'active').
 */
import type { Plan } from "./subscription-derive";

/**
 * The landing page's anchors spell the annual plan "annual" (see docs/
 * commerce-launch-checklist.md); this app's own `Plan` type spells the same
 * thing "yearly" (subscription-derive.ts). This map is the one place that
 * reconciles the two spellings.
 */
export const PLAN_PARAM_TO_PLAN: Record<string, Plan> = { monthly: "monthly", annual: "yearly" };

export type SubscribeDecision =
  | { kind: "invalid-plan" }
  | { kind: "no-session"; planParam: string }
  | { kind: "already-active" }
  | { kind: "checkout"; plan: Plan };

export function parsePlanParam(planParam: string | null): Plan | undefined {
  return planParam ? PLAN_PARAM_TO_PLAN[planParam] : undefined;
}

/**
 * `hasSession`/`isActive` are the route's own DB/session lookups, passed in
 * already resolved -- this function makes no calls of its own, so it can't
 * accidentally skip or reorder one of them.
 */
export function decideSubscribeAction(input: {
  planParam: string | null;
  hasSession: boolean;
  isActive: boolean;
}): SubscribeDecision {
  const plan = parsePlanParam(input.planParam);
  if (!plan) return { kind: "invalid-plan" };
  if (!input.hasSession) return { kind: "no-session", planParam: input.planParam as string };
  if (input.isActive) return { kind: "already-active" };
  return { kind: "checkout", plan };
}
