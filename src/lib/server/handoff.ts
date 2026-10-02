/**
 * Server-side resolution for /handoff (src/routes/handoff.tsx). Re-derives
 * everything from the verified session rather than trusting anything the
 * client passes except the plan param -- /handoff is reachable directly by
 * URL (not only via /subscribe's own redirect), so it reuses
 * decideSubscribeAction (src/lib/subscribe-resolve.ts) to enforce the exact
 * same invalid-plan/already-active protections /subscribe does, rather than
 * assuming a caller already checked.
 */
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { resolveHouseholdId, getOrCreateCheckoutToken } from "@/lib/server/household";
import { getPassStateForHousehold } from "@/lib/server/subscription";
import { decideSubscribeAction } from "@/lib/subscribe-resolve";
import { buildCheckoutUrl, shopifyStoreDomain } from "@/lib/shopify-checkout";
import type { Plan } from "@/lib/subscription-derive";

export type HandoffResult =
  | { kind: "invalid-plan" }
  | { kind: "already-active" }
  /** `plan` is the SERVER's resolution of the plan param, not the raw query string -- the ticket renders a price from it, so it must not be attacker-chosen. */
  | { kind: "checkout"; checkoutUrl: string; domain: string; plan: Plan; accountEmail: string | null }
  /**
   * buildCheckoutUrl's own comment says its caller "decides how to surface
   * that instead of silently sending a family to a 404" -- this is that
   * surface. Never thrown past this handler: an unconfigured Shopify env var
   * (store domain / variant id) on the deployed revision must not look
   * identical, from the visitor's side, to "no plan selected" or "already
   * subscribed". No message detail reaches the client beyond the fixed
   * copy handoff.tsx renders for it -- the reason code below is server logs
   * only.
   */
  | { kind: "error" };

/** Server logs only -- never in the HandoffResult sent to the client. No plan value beyond the param the visitor already put in the URL themselves, no token, no household/user id. */
function logHandoffOutcome(reasonCode: string, planParam: string, tokenPresent: boolean) {
  console.log(`[handoff] reason=${reasonCode} plan=${planParam} token_present=${tokenPresent}`);
}

export const resolveHandoff = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { planParam: string }) => input)
  .handler(async ({ context, data }): Promise<HandoffResult> => {
    const sql = await getSql();
    const householdId = await resolveHouseholdId(sql, context.userId);
    // Same two facts /subscribe resolves, from the same single recompute:
    // /handoff is reachable directly, so it has to allow the annual -> buyout
    // upgrade on exactly the same terms rather than refusing what /subscribe
    // just forwarded here.
    const pass = await getPassStateForHousehold(sql, householdId);
    const decision = decideSubscribeAction({
      planParam: data.planParam,
      hasSession: true,
      isActive: pass.active,
      currentPlan: pass.plan,
    });

    if (decision.kind !== "checkout") {
      const kind = decision.kind === "no-session" ? "invalid-plan" : decision.kind;
      logHandoffOutcome(kind, data.planParam, false);
      return { kind };
    }

    const token = await getOrCreateCheckoutToken(sql, householdId);
    // The account email, for the checkout[email] prefill (work order §6.1)
    // and the on-screen notice (§6.2) -- never used for household lookup,
    // only ever a default Shopify lets the customer change.
    const userRows = await sql<{ email: string | null }>`
      select email from "user" where id = ${context.userId}
    `;
    const accountEmail = userRows[0]?.email ?? null;
    try {
      const checkoutUrl = buildCheckoutUrl(decision.plan, token, accountEmail);
      logHandoffOutcome("checkout", data.planParam, Boolean(token));
      return { kind: "checkout", checkoutUrl, domain: shopifyStoreDomain(), plan: decision.plan, accountEmail };
    } catch (err) {
      // Exactly the case this file's own module comment calls out: a missing
      // SHOPIFY_STORE_DOMAIN / SHOPIFY_VARIANT_* on the running revision.
      // Logged with the actual message (config error, never customer data)
      // so this is diagnosable from server logs alone, without reproducing
      // it -- config gaps like this don't reproduce in a source read.
      console.error(`[handoff] config error building checkout URL: ${err instanceof Error ? err.message : String(err)}`);
      logHandoffOutcome("config-error", data.planParam, Boolean(token));
      return { kind: "error" };
    }
  });
