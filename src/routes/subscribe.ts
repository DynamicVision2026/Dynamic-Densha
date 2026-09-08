/**
 * The Unified Funnel's one server-side identity/checkout resolver. Every
 * "subscribe" CTA on the (deliberately static/inert) landing page
 * (kanji-ai.jp) points here instead of straight at a Stripe Payment Link --
 * only this app knows who is signed in, so only this app can attach the
 * right household's checkout_token to the Stripe URL.
 *
 * This is a redirect, not a page: it renders nothing and holds no state,
 * matching the src/routes/api/webhooks/stripe.ts precedent for a plain
 * server: { handlers } route rather than a component route. Its entire job
 * is resolve household -> build URL -> 302, in exactly these five branches
 * (the decision itself lives in the pure, unit-tested
 * src/lib/subscribe-resolve.ts -- this file only does the DB/session work
 * each branch implies, and stops early rather than doing that work for a
 * plan that was never going to resolve to anything):
 *
 *   1. plan missing/invalid          -> /app/parent
 *   2. no session                    -> /login?next=<encoded self>
 *   3. session, no household yet     -> resolveHouseholdId creates one
 *      (idempotent -- also just the normal "already has one" path)
 *   4. household already 'active'    -> /app/parent?already=active
 *      (never double-charge -- the dashboard shows the current plan)
 *   5. otherwise                     -> mint/read checkout_token, 302 to
 *      Stripe with ?client_reference_id=<token>, never the raw household_id
 *
 * Identity never crosses the origin boundary; a plan name does.
 */
import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { resolveUserIdFromHeaders } from "@/lib/auth/verify.server";
import { getOrCreateCheckoutToken, resolveHouseholdId } from "@/lib/server/household";
import { isHouseholdActive } from "@/lib/server/subscription";
import { monthlyCheckoutUrl, yearlyCheckoutUrl } from "@/lib/checkout-link";
import { decideSubscribeAction, parsePlanParam } from "@/lib/subscribe-resolve";

function redirectTo(location: string): Response {
  return new Response(null, { status: 302, headers: { Location: location } });
}

export const Route = createFileRoute("/subscribe")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const planParam = url.searchParams.get("plan");

        // Branch 1: bail before touching session/DB at all -- a garbage or
        // absent plan has nothing left to resolve.
        if (!parsePlanParam(planParam)) return redirectTo("/app/parent");

        const userId = await resolveUserIdFromHeaders(request.headers);
        // Branch 3 ("session, no household yet") has no URL of its own --
        // resolveHouseholdId is idempotent, so calling it here (only once a
        // session is confirmed) IS that branch, without a separate
        // existence check first.
        const householdId = userId ? await resolveHouseholdId(await getSql(), userId) : null;
        const isActive = householdId ? await isHouseholdActive(await getSql(), householdId) : false;

        const decision = decideSubscribeAction({ planParam, hasSession: userId != null, isActive });

        switch (decision.kind) {
          // Unreachable here (planParam already validated above); kept so
          // decideSubscribeAction's own branches stay exhaustively testable.
          case "invalid-plan":
            return redirectTo("/app/parent");
          case "no-session": {
            const self = `/subscribe?plan=${decision.planParam}`;
            return redirectTo(`/login?next=${encodeURIComponent(self)}`);
          }
          case "already-active":
            return redirectTo("/app/parent?already=active");
          case "checkout": {
            const token = await getOrCreateCheckoutToken(await getSql(), householdId as string);
            const checkoutUrl =
              decision.plan === "yearly" ? yearlyCheckoutUrl(token) : monthlyCheckoutUrl(token);
            return redirectTo(checkoutUrl);
          }
        }
      },
    },
  },
});
