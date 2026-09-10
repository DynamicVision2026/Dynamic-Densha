/**
 * The server side of /subscribe/success. Reports entitlement; never grants
 * it (see getPassStateForHousehold's own comment, and the webhook-only
 * gate in scripts/check-webhook-only-entitlement.mjs).
 *
 * Deliberately not getParentTrialBanner, which this could otherwise reuse:
 * that one lazily mints a household's checkout_token as a side effect, and
 * a screen polled every two seconds has no business doing that.
 */
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { resolveHouseholdId } from "@/lib/server/household";
import { getPassStateForHousehold } from "@/lib/server/subscription";
import type { Plan } from "@/lib/subscription-derive";

export type PassState = {
  active: boolean;
  plan: Plan | null;
  paidUntil: string | null;
};

export const getPassState = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<PassState> => {
    const sql = await getSql();
    const householdId = await resolveHouseholdId(sql, context.userId);
    return getPassStateForHousehold(sql, householdId);
  });
