/**
 * Which child an annual pass covers, and the two questions every
 * child-scoped server function has to answer before it writes anything:
 * does this child belong to the caller's household, and may this child ride
 * right now.
 *
 * Split out of subscription.ts because coverage lives on `household`, not on
 * the derived `subscription` row -- and because the ownership check below is
 * the one that gets skipped. Before route scoping, every child-scoped
 * function took a childId and filtered by `user_id = <session user>`, which
 * worked only because household and user happen to be 1:1 today. The moment
 * a second parent joins a household (joinHousehold, already written), that
 * filter silently stops matching their co-parent's children. Ownership is a
 * household question and is asked as one here.
 */
import { entitlementFor, type Entitlement } from "@/lib/entitlement";
import { recomputeSubscription } from "@/lib/server/subscription";

type Sql = {
  <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]>;
};

/**
 * Why a child-scoped call was refused.
 *
 * `status` is the distinction the ticket cares about and the reason this is
 * a class rather than four `throw new Error("...")`s:
 *
 *   404 -- no such child IN THIS HOUSEHOLD. Never 403. A 403 would confirm
 *          that the id exists, which turns a guessed id into an existence
 *          oracle: hand someone a 403 for one id and a 404 for another and
 *          they can enumerate. A child that isn't yours and a child that
 *          isn't anyone's must be indistinguishable.
 *   403 -- the child is yours and is refused anyway: the household is
 *          lapsed, or an annual pass covers a sibling. The caller already
 *          knows this child exists, so there is nothing left to leak.
 *
 * The messages are the child-facing Japanese the UI already shows, since
 * these do surface; neither says which of the two happened.
 */
export class ChildAccessError extends Error {
  constructor(
    readonly status: 404 | 403,
    message: string,
  ) {
    super(message);
    this.name = "ChildAccessError";
  }
}

export type CoverageRow = {
  coveredChildId: string | null;
  coveredAssignedAt: string | null;
};

/** household.covered_child_id / covered_assigned_at. */
export async function readCoverage(sql: Sql, householdId: string): Promise<CoverageRow> {
  const rows = await sql<{ covered_child_id: string | null; covered_assigned_at: string | Date | null }>`
    select covered_child_id, covered_assigned_at from household where id = ${householdId}
  `;
  const row = rows[0];
  const assigned = row?.covered_assigned_at ?? null;
  return {
    coveredChildId: row?.covered_child_id ?? null,
    coveredAssignedAt: assigned instanceof Date ? assigned.toISOString() : assigned ? String(assigned) : null,
  };
}

export type OwnedChild = { id: string; name: string; grade: number };

/**
 * The child, if it belongs to this household and is not archived.
 *
 * Matched by household_id, OR by creator when the row's household_id is null.
 * That second clause exists because a null household_id is not evidence of a
 * stranger's child -- it is evidence of a row written during a deploy window,
 * between a migration adding the column and the revision that populates it
 * going live. Treating those rows as nobody's made a family's own children
 * invisible to them (see listChildren's note).
 *
 * It cannot widen access beyond the family: user_id is the child's creator,
 * and a creator belongs to exactly one household, so a row reached this way
 * is always the caller's own. `userId` is required rather than optional so
 * every call site has to think about it.
 */
export async function findOwnedChild(
  sql: Sql,
  householdId: string,
  childId: string,
  userId?: string,
): Promise<OwnedChild | null> {
  if (!childId) return null;
  const rows = await sql<{ id: string; name: string; grade: number }>`
    select id, name, grade from children
    where id = ${childId} and archived_at is null
      and (household_id = ${householdId}
           or (household_id is null and user_id = ${userId ?? null}))
  `;
  return rows[0] ?? null;
}

/** findOwnedChild or a 404. Use wherever a childId arrives from a client. */
export async function assertOwnedChild(
  sql: Sql,
  householdId: string,
  childId: string,
  userId?: string,
): Promise<OwnedChild> {
  const child = await findOwnedChild(sql, householdId, childId, userId);
  if (!child) throw new ChildAccessError(404, "お子さまの情報が見つかりません");
  return child;
}

/**
 * This child's entitlement right now. `childId: null` asks the
 * household-level question (see entitlementFor).
 */
export async function getChildEntitlement(
  sql: Sql,
  householdId: string,
  childId: string | null,
  nowIso: string = new Date().toISOString(),
): Promise<Entitlement> {
  const derived = await recomputeSubscription(sql, householdId, nowIso);
  const coverage = await readCoverage(sql, householdId);
  return entitlementFor(
    { state: derived.state, effectiveTrialEnd: derived.effectiveTrialEnd, paidUntil: derived.paidUntil },
    { coveredChildId: coverage.coveredChildId },
    childId,
    nowIso,
  );
}

/**
 * The gate every ride-path server function calls first: ownership, then
 * entitlement, in that order and never the other way round. Answering "not
 * entitled" for a child that isn't yours would leak its existence, which is
 * exactly what the 404/403 split above exists to prevent.
 *
 * Replaces assertCanRide(sql, userId), which asked only the household-level
 * question and so let any child of a covered household ride on an annual
 * pass assigned to one sibling.
 */
export async function assertChildCanRide(
  sql: Sql,
  householdId: string,
  childId: string,
  nowIso: string = new Date().toISOString(),
  userId?: string,
): Promise<OwnedChild> {
  const child = await assertOwnedChild(sql, householdId, childId, userId);
  const gate = await getChildEntitlement(sql, householdId, childId, nowIso);
  if (!gate.canRide) throw new ChildAccessError(403, "この列車は いま のれません");
  return child;
}
