/**
 * The one place that reads billing_event + admin_action and caches the
 * result into `subscription` (commerce spec §7.1). Every other file that
 * needs a household's entitlement calls getEntitlementForHousehold below —
 * never reads `subscription.state` and branches on it directly (that's
 * exactly what scripts/check-single-entitlement.mjs enforces).
 */
import {
  deriveSubscription,
  type AdminActionInput,
  type BillingEventInput,
} from "@/lib/subscription-derive";
import { entitlement, type Entitlement } from "@/lib/entitlement";

type Sql = {
  <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]>;
};

/** Recompute a household's subscription from its event logs and cache the result. Idempotent. */
export async function recomputeSubscription(
  sql: Sql,
  householdId: string,
  nowIso: string = new Date().toISOString(),
) {
  const base = await sql<{ trial_ends_at: string | null }>`
    select trial_ends_at from subscription where household_id = ${householdId}
  `;
  const baseTrialEndsAt = base[0]?.trial_ends_at ?? null;

  const eventRows = await sql<{ type: string; payload: unknown; received_at: string }>`
    select type, payload, received_at from billing_event
    where household_id = ${householdId}
    order by received_at asc
  `;
  const events: BillingEventInput[] = eventRows.map((r) => {
    const payload = (r.payload ?? {}) as { plan?: string };
    return {
      type: r.type as BillingEventInput["type"],
      receivedAt: r.received_at,
      plan: payload.plan === "yearly" || payload.plan === "monthly" ? payload.plan : undefined,
    };
  });

  const adminRows = await sql<{ type: string; days: number | null; created_at: string }>`
    select type, days, created_at from admin_action
    where household_id = ${householdId}
    order by created_at asc
  `;
  const adminActions: AdminActionInput[] = adminRows.map((r) =>
    r.type === "trial_extended"
      ? { type: "trial_extended" as const, days: r.days ?? 0, createdAt: r.created_at }
      : { type: "note" as const, createdAt: r.created_at },
  );

  const derived = deriveSubscription({ baseTrialEndsAt, events, adminActions, nowIso });

  await sql`
    update subscription
    set state = ${derived.state},
        paid_until = ${derived.paidUntil},
        plan = ${derived.plan},
        updated_at = now()
    where household_id = ${householdId}
  `;

  return derived;
}

/**
 * The one call site pattern: every surface that needs to know whether a
 * household can ride or view calls this, never reads `subscription.state`
 * itself.
 */
export async function getEntitlementForHousehold(
  sql: Sql,
  householdId: string,
  nowIso: string = new Date().toISOString(),
): Promise<Entitlement> {
  const derived = await recomputeSubscription(sql, householdId, nowIso);
  return entitlement({ state: derived.state, effectiveTrialEnd: derived.effectiveTrialEnd }, nowIso);
}
