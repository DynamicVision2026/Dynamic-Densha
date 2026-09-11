/**
 * The household facts the settings hub shows about the account itself:
 * who is signed in, what they bought, and how many children the current tier
 * allows.
 *
 * Parent surface only. Nothing here is ever read by a child surface -- an
 * email address, an order number and a tier are all things a child must not
 * learn from a screen.
 */
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { childQuota } from "@/lib/entitlement";
import { resolveHouseholdId } from "@/lib/server/household";
import { recomputeSubscription } from "@/lib/server/subscription";
import type { Plan } from "@/lib/subscription-derive";

export type AccountSummary = {
  email: string | null;
  /**
   * The order NAME (`#1001`), not the numeric Shopify id. This is the one a
   * parent can find on their receipt and the one support will ask them to
   * quote; the numeric id appears nowhere a customer ever sees.
   */
  orderName: string | null;
  plan: Plan | null;
  paidUntil: string | null;
  childCount: number;
  /** -1 means uncapped. A paid household may create as many children as it likes. */
  childLimit: number;
};

export const getAccountSummary = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<AccountSummary> => {
    const sql = await getSql();
    const nowIso = new Date().toISOString();
    const householdId = await resolveHouseholdId(sql, context.userId, nowIso);
    const derived = await recomputeSubscription(sql, householdId, nowIso);

    const userRows = await sql<{ email: string | null }>`
      select email from "user" where id = ${context.userId}
    `;

    // Same field the admin console reads. Null until an orders/paid webhook
    // has actually landed -- a household that has not bought anything has no
    // order to name, and a household mid-checkout must not be shown one.
    const orderRows = await sql<{ order_name: string | null }>`
      select payload->'raw'->>'name' as order_name
      from billing_event
      where household_id = ${householdId} and type = 'order_paid'
      order by received_at desc
      limit 1
    `;

    const countRows = await sql<{ c: number }>`
      select count(*)::int as c from children
      where household_id = ${householdId} and archived_at is null
    `;

    // The cap comes from the same function createChild enforces, so the
    // "2 / 3" beside the add button can never drift from what the server
    // will actually allow.
    const quota = childQuota(
      { state: derived.state, effectiveTrialEnd: derived.effectiveTrialEnd, paidUntil: derived.paidUntil },
      nowIso,
    );

    return {
      email: userRows[0]?.email ?? null,
      orderName: orderRows[0]?.order_name ?? null,
      plan: derived.plan,
      paidUntil: derived.paidUntil,
      childCount: countRows[0]?.c ?? 0,
      childLimit: quota.canCreate ? (quota.limit === Infinity ? -1 : quota.limit) : 0,
    };
  });
