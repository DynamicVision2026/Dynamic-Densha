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
import { isHouseholdActive } from "@/lib/server/subscription";
import { decideSubscribeAction } from "@/lib/subscribe-resolve";
import { buildCheckoutUrl, shopifyStoreDomain } from "@/lib/shopify-checkout";

export type HandoffResult =
  | { kind: "invalid-plan" }
  | { kind: "already-active" }
  | { kind: "checkout"; checkoutUrl: string; domain: string };

export const resolveHandoff = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { planParam: string }) => input)
  .handler(async ({ context, data }): Promise<HandoffResult> => {
    const sql = await getSql();
    const householdId = await resolveHouseholdId(sql, context.userId);
    const isActive = await isHouseholdActive(sql, householdId);
    const decision = decideSubscribeAction({ planParam: data.planParam, hasSession: true, isActive });

    if (decision.kind !== "checkout") return { kind: decision.kind === "no-session" ? "invalid-plan" : decision.kind };

    const token = await getOrCreateCheckoutToken(sql, householdId);
    return { kind: "checkout", checkoutUrl: buildCheckoutUrl(decision.plan, token), domain: shopifyStoreDomain() };
  });
