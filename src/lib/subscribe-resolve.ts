/**
 * The pure decision core of src/routes/subscribe.ts (and src/lib/server/
 * handoff.ts, which reuses it so /handoff enforces the exact same
 * already-active/invalid-plan protections when reached directly rather than
 * only via /subscribe's own redirect) -- split out the same way
 * shopify-signature.ts and shopify-plan.ts are split from their own
 * route/DB glue: this file touches no DB, no request, no cookies, so the
 * plain node test runner can exercise every branch directly (see
 * scripts/subscribe-resolve.test.ts) without Vite's `@/` path aliasing.
 *
 * The route itself does the actual work each branch implies (creating a
 * household, minting a checkout_token, handing off to Shopify) -- this
 * function only decides WHICH of the five branches applies, given inputs
 * the caller has already resolved (a parsed plan, whether there's a
 * session, whether the household is already 'active').
 */
import type { Plan } from "./subscription-derive";

/** The only two plan params this app accepts -- both spelled exactly like this app's own Plan type, no reconciliation needed. */
export const PLAN_PARAM_TO_PLAN: Record<string, Plan> = { buyout: "buyout", annual: "annual" };

export type SubscribeDecision =
  | { kind: "invalid-plan" }
  | { kind: "no-session"; planParam: string }
  | { kind: "already-active" }
  | { kind: "checkout"; plan: Plan };

export function parsePlanParam(planParam: string | null): Plan | undefined {
  return planParam ? PLAN_PARAM_TO_PLAN[planParam] : undefined;
}

/**
 * `hasSession`/`isActive`/`currentPlan` are the caller's own DB/session
 * lookups, passed in already resolved -- this function makes no calls of its
 * own, so it can't accidentally skip or reorder one of them.
 *
 * `currentPlan` is what an active household already holds, and it is what
 * separates "never double-charge" from "refusing the upgrade we advertise".
 * An annual pass covers ONE child at a time; the pass card, the (?) help and
 * the family hint all tell an annual household that ご家庭ライセンス is how
 * every child rides. Treating every active household as done meant that CTA
 * resolved to /app/parent?already=active -- the one upgrade the product asks
 * families to make was the one purchase it would not accept.
 *
 * So the guard is now about what they hold rather than merely that they hold
 * something:
 *   - buyout already          -> nothing to upgrade to; it covers every child
 *   - the same plan again     -> a renewal/re-purchase, still refused
 *   - active but plan unknown -> refuse, deliberately: the rare unmatched
 *     variant (see subscription-derive.ts) means we cannot say what they paid
 *     for, and a wrong guess here charges a family twice
 *   - annual -> buyout        -> the advertised upgrade, allowed
 *
 * It buys coverage, not time: no proration and no automatic refund of the
 * annual remainder (返金・ご解約 stays the manual route), which is why this
 * decision is narrow rather than "active households may buy anything".
 */
export function decideSubscribeAction(input: {
  planParam: string | null;
  hasSession: boolean;
  isActive: boolean;
  currentPlan?: Plan | null;
}): SubscribeDecision {
  const plan = parsePlanParam(input.planParam);
  if (!plan) return { kind: "invalid-plan" };
  if (!input.hasSession) return { kind: "no-session", planParam: input.planParam as string };
  if (input.isActive && !isUpgrade(input.currentPlan ?? null, plan)) return { kind: "already-active" };
  return { kind: "checkout", plan };
}

/** The only purchase an already-active household may make: annual -> buyout. */
export function isUpgrade(currentPlan: Plan | null, wanted: Plan): boolean {
  return currentPlan === "annual" && wanted === "buyout";
}
