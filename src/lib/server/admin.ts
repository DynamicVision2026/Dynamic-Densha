/**
 * Admin dashboard data (/app/admin) — user, payment, and entitlement
 * oversight across every household. This is the one place in the app that
 * reads and displays PII (parent name/email, children's names) across ALL
 * households at once, so the gate below is enforced server-side, inside the
 * `createServerFn` handler itself — never left to the client route to hide
 * or show a component. A bug here would leak every family's data to anyone
 * signed in, so the check runs before any query below it.
 *
 * Status/plan display never compares a raw `subscription.state` literal
 * (see scripts/check-single-entitlement.mjs) — every row's live status goes
 * through effectiveStateOf(), the same corrected read every other surface
 * uses (see server/subscription.ts's own comment on why the raw cached
 * state isn't enough for an annual pass past its own paid_until).
 */
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { recomputeSubscription } from "@/lib/server/subscription";
import { effectiveStateOf, type SubscriptionState } from "@/lib/entitlement";
import type { Plan } from "@/lib/subscription-derive";
import { isAdminEmail } from "@/lib/admin-gate";

/** Bucket for display only — trial/active/lapsed per the dashboard spec; guest and cancelled (no live entitlement) fold into "lapsed". */
function displayStatus(effective: SubscriptionState): "trial" | "active" | "lapsed" {
  switch (effective) {
    case "trial":
      return "trial";
    case "active":
      return "active";
    case "guest":
    case "lapsed":
    case "cancelled":
      return "lapsed";
  }
}

export type AdminSummary = {
  totalHouseholds: number;
  activePaidBuyout: number;
  activePaidAnnual: number;
  activeTrials: number;
  lapsedInactive: number;
};

export type AdminChildRow = {
  name: string;
  createdAt: string;
  /** True once a parent has hidden this profile (src/lib/server/children.ts's archiveChild) -- still shown here for oversight, unlike every parent-facing list. */
  archived: boolean;
};

export type AdminHouseholdRow = {
  householdId: string;
  ownerName: string | null;
  ownerEmail: string | null;
  createdAt: string;
  status: "trial" | "active" | "lapsed";
  plan: Plan | "none";
  validUntilKind: "date" | "unlimited" | "none";
  validUntilIso: string | null;
  childCount: number;
  children: AdminChildRow[];
  shopifyOrderId: string | null;
};

/** A recent Shopify webhook delivery, as the admin needs to read it: what came in, for whom, and against which order. */
export type AdminWebhookEvent = {
  receivedAt: string;
  type: string;
  householdId: string;
  ownerEmail: string | null;
  orderName: string | null;
  shopifyOrderId: string | null;
  plan: string | null;
};

export type AdminOverview = {
  summary: AdminSummary;
  households: AdminHouseholdRow[];
  webhookEvents: AdminWebhookEvent[];
};

function toIso(v: string | Date): string {
  return v instanceof Date ? v.toISOString() : v;
}

type Sql = Awaited<ReturnType<typeof getSql>>;

/**
 * The one place the admin decision is made from a session. Both the status
 * probe and the data query go through it, so there is no way for the cheap
 * check the routes use and the real gate on the data to drift apart.
 */
async function isCallerAdmin(sql: Sql, userId: string): Promise<boolean> {
  const rows = await sql<{ email: string | null }>`
    select email from "user" where id = ${userId}
  `;
  return isAdminEmail(rows[0]?.email ?? null, process.env.ADMIN_EMAILS);
}

/**
 * "Is the caller an admin" and nothing else — a boolean, never an email,
 * never a household.
 *
 * Exists because several consumer routes now have to answer one question
 * before they gate someone: /onboard and /app both funnel a childless
 * account into the register-a-child form, which is correct for a parent and
 * wrong for an admin, who has no child and never will. Those routes only
 * ask this when they are ABOUT to redirect into onboarding, so a normal
 * family never pays for the query.
 */
export const getAdminStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ isAdmin: boolean }> => {
    const sql = await getSql();
    return { isAdmin: await isCallerAdmin(sql, context.userId) };
  });

/**
 * Every household, owner, and child, plus live-derived status/plan/valid-
 * until — sorted by registration date, newest first — and the recent webhook
 * log. Throws unless the caller's own account email matches the admin
 * allow-list; the route renders a 403 in that case (routes/app/admin.tsx)
 * rather than redirecting, since bouncing a refused caller to /app put a
 * childless account straight into the register-a-child form.
 */
export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<AdminOverview> => {
    const sql = await getSql();
    if (!(await isCallerAdmin(sql, context.userId))) throw new Error("Not authorized");

    const nowIso = new Date().toISOString();

    const households = await sql<{ id: string; created_at: string | Date }>`
      select id, created_at from household order by created_at desc
    `;

    const owners = await sql<{ household_id: string; name: string | null; email: string | null }>`
      select hm.household_id, u.name, u.email
      from household_member hm
      join "user" u on u.id = hm.user_id
      where hm.role = 'owner'
    `;
    const ownerByHousehold = new Map(owners.map((o) => [o.household_id, o]));

    // children.household_id (added by 0010_commerce.sql) is only ever
    // written by that migration's own one-time backfill -- nothing in this
    // codebase sets it for a child created since (createChild in
    // src/lib/server/children.ts inserts with no household_id at all). The
    // actual, current source of truth for "which household is this child
    // in" is the same one entitlement uses everywhere else: household_member
    // links user_id -> household_id (spec §2), so join through that instead
    // of the stale column.
    //
    // created_at (with archived_at) is included, unlike every parent-facing
    // listChildren call, specifically so a rapid double-submit -- two rows
    // with the same name seconds apart -- is immediately visible here; this
    // is also the one child listing in the app that does NOT filter out
    // archived_at is not null, since an admin needs to see the full
    // lifecycle (including what a parent has already hidden), not just the
    // currently-visible set.
    const childRows = await sql<{
      household_id: string;
      name: string;
      created_at: string | Date;
      archived_at: string | Date | null;
    }>`
      select hm.household_id, c.name, c.created_at, c.archived_at
      from children c
      join household_member hm on hm.user_id = c.user_id
      order by c.created_at asc
    `;
    const childrenByHousehold = new Map<string, AdminChildRow[]>();
    for (const c of childRows) {
      const list = childrenByHousehold.get(c.household_id) ?? [];
      list.push({ name: c.name, createdAt: toIso(c.created_at), archived: c.archived_at != null });
      childrenByHousehold.set(c.household_id, list);
    }

    const summary: AdminSummary = {
      totalHouseholds: households.length,
      activePaidBuyout: 0,
      activePaidAnnual: 0,
      activeTrials: 0,
      lapsedInactive: 0,
    };

    const rows: AdminHouseholdRow[] = [];
    for (const h of households) {
      const derived = await recomputeSubscription(sql, h.id, nowIso);
      const effective = effectiveStateOf(
        { state: derived.state, effectiveTrialEnd: derived.effectiveTrialEnd, paidUntil: derived.paidUntil },
        nowIso,
      );
      const status = displayStatus(effective);

      switch (status) {
        case "trial":
          summary.activeTrials += 1;
          break;
        case "active":
          if (derived.plan === "annual") summary.activePaidAnnual += 1;
          else summary.activePaidBuyout += 1;
          break;
        case "lapsed":
          summary.lapsedInactive += 1;
          break;
      }

      let validUntilKind: AdminHouseholdRow["validUntilKind"] = "none";
      let validUntilIso: string | null = null;
      if (derived.plan === "buyout") {
        validUntilKind = "unlimited";
      } else if (derived.plan === "annual" && derived.paidUntil) {
        validUntilKind = "date";
        validUntilIso = derived.paidUntil;
      } else if (status === "trial" && derived.effectiveTrialEnd) {
        validUntilKind = "date";
        validUntilIso = derived.effectiveTrialEnd;
      }

      const owner = ownerByHousehold.get(h.id);
      const children = childrenByHousehold.get(h.id) ?? [];

      rows.push({
        householdId: h.id,
        ownerName: owner?.name ?? null,
        ownerEmail: owner?.email ?? null,
        createdAt: toIso(h.created_at),
        status,
        plan: derived.plan ?? "none",
        validUntilKind,
        validUntilIso,
        childCount: children.length,
        children,
        shopifyOrderId: derived.shopifyOrderId,
      });
    }

    // Webhook log. billing_event is the append-only record of what Shopify
    // actually delivered, so this is the one place to see a payment that
    // landed against no household, or a refund that arrived before its own
    // order. payload->'raw'->>'name' is the Shopify order name (#1001);
    // shopifyOrderId is the numeric id the refund path matches on.
    const events = await sql<{
      received_at: string | Date;
      type: string;
      household_id: string;
      email: string | null;
      order_name: string | null;
      shopify_order_id: string | null;
      plan: string | null;
    }>`
      select be.received_at, be.type, be.household_id, u.email,
             be.payload->'raw'->>'name' as order_name,
             be.payload->>'shopifyOrderId' as shopify_order_id,
             be.payload->>'plan' as plan
      from billing_event be
      left join household_member hm on hm.household_id = be.household_id and hm.role = 'owner'
      left join "user" u on u.id = hm.user_id
      order by be.received_at desc
      limit 50
    `;

    return {
      summary,
      households: rows,
      webhookEvents: events.map((e) => ({
        receivedAt: toIso(e.received_at),
        type: e.type,
        householdId: e.household_id,
        ownerEmail: e.email,
        orderName: e.order_name,
        shopifyOrderId: e.shopify_order_id,
        plan: e.plan,
      })),
    };
  });
