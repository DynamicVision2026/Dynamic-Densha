/**
 * The Unified Funnel's one server-side identity resolver. Every "subscribe"
 * CTA on the (deliberately static/inert) landing page (kanji-ai.jp) points
 * here instead of straight at a Shopify cart link -- only this app knows
 * who is signed in, so only this app can attach the right household's
 * checkout_token before handing off.
 *
 * This is a redirect, not a page: it renders nothing and holds no state,
 * matching the src/routes/api/webhooks/shopify.ts precedent for a plain
 * server: { handlers } route rather than a component route. Its entire job
 * is resolve household -> decide -> 302, in exactly these five branches
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
 *   5. otherwise                     -> /handoff?plan=<plan>, which shows
 *      the Shopify domain + Tokushoho link and redirects there itself --
 *      never a direct 302 to Shopify from here, so the visitor always sees
 *      where they're headed before payment.
 *
 * Identity never crosses the origin boundary; a plan name does.
 */
import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { resolveUserIdFromHeaders } from "@/lib/auth/verify.server";
import { resolveHouseholdId } from "@/lib/server/household";
import { getPassStateForHousehold } from "@/lib/server/subscription";
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
        // getPassStateForHousehold, not isHouseholdActive: the decision needs
        // WHICH plan an active household holds (an annual one may still buy
        // the family licence), and this returns both from the one recompute
        // the active check was already paying for.
        const pass = householdId ? await getPassStateForHousehold(await getSql(), householdId) : null;

        const decision = decideSubscribeAction({
          planParam,
          hasSession: userId != null,
          isActive: pass?.active ?? false,
          currentPlan: pass?.plan ?? null,
        });

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
          case "checkout":
            return redirectTo(`/handoff?plan=${decision.plan}`);
        }
      },
    },
  },
});
