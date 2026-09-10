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
  childNames: string[];
  shopifyOrderId: string | null;
};

export type AdminOverview = {
  summary: AdminSummary;
  households: AdminHouseholdRow[];
};

function toIso(v: string | Date): string {
  return v instanceof Date ? v.toISOString() : v;
}

/**
 * Every household, owner, and child, plus live-derived status/plan/valid-
 * until — sorted by registration date, newest first. Throws (client redirects
 * to /app on any error, unauthenticated included — see routes/app/admin.tsx)
 * unless the caller's own account email matches the admin allow-list.
 */
export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<AdminOverview> => {
    const sql = await getSql();
    const requester = await sql<{ email: string | null }>`
      select email from "user" where id = ${context.userId}
    `;
    if (!isAdminEmail(requester[0]?.email ?? null, process.env.ADMIN_EMAILS)) {
      throw new Error("Not authorized");
    }

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
    const childRows = await sql<{ household_id: string; name: string }>`
      select hm.household_id, c.name
      from children c
      join household_member hm on hm.user_id = c.user_id
      order by c.created_at asc
    `;
    const childrenByHousehold = new Map<string, string[]>();
    for (const c of childRows) {
      const list = childrenByHousehold.get(c.household_id) ?? [];
      list.push(c.name);
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
      const childNames = childrenByHousehold.get(h.id) ?? [];

      rows.push({
        householdId: h.id,
        ownerName: owner?.name ?? null,
        ownerEmail: owner?.email ?? null,
        createdAt: toIso(h.created_at),
        status,
        plan: derived.plan ?? "none",
        validUntilKind,
        validUntilIso,
        childCount: childNames.length,
        childNames,
        shopifyOrderId: derived.shopifyOrderId,
      });
    }

    return { summary, households: rows };
  });
