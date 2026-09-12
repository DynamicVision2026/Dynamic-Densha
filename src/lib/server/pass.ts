/**
 * The server side of /subscribe/success. Reports entitlement; never grants
 * it (see getPassStateForHousehold's own comment, and the webhook-only
 * gate in scripts/check-webhook-only-entitlement.mjs).
 *
 * Deliberately not getParentTrialBanner, which this could otherwise reuse:
 * that one lazily mints a household's checkout_token as a side effect, and
 * a screen polled every two seconds has no business doing that.
 */
// Global crypto.randomUUID(), deliberately NOT `import { randomUUID } from
// "node:crypto"`: src/routes/app/parent.tsx imports getPassAssignment from
// this file, so this module's top-level imports are pulled into the CLIENT
// bundle even though the handler bodies are split out -- and a node:crypto
// import there breaks the whole parent page at runtime with "Module
// node:crypto has been externalized for browser compatibility". Typecheck
// and the test suite both passed with it; only a real browser found it.
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, withTransaction } from "@/lib/db";
import { resolveHouseholdId } from "@/lib/server/household";
import { withHouseholdLock } from "@/lib/server/household-lock";
import { findOwnedChild, readCoverage } from "@/lib/server/coverage";
import { getPassStateForHousehold, recomputeSubscription } from "@/lib/server/subscription";
import { cooldownStateOf } from "@/lib/pass-assignment";
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


export type AssignError =
  | { code: "NOT_ANNUAL" }
  | { code: "CHILD_NOT_FOUND" }
  | { code: "COOLDOWN_ACTIVE"; nextAllowedAt: string };

export type AssignResult = { ok: true } | { error: AssignError };

/**
 * Move the annual pass to a child.
 *
 * Returns its failures as values rather than throwing them: all three are
 * states the parent surface renders (a cooldown date, a plan explanation),
 * not exceptions. A thrown error would have to be string-matched by the UI
 * to tell them apart, which is how error copy drifts out of sync with the
 * condition that produced it.
 *
 * CHILD_NOT_FOUND covers both "no such child" and "a child in someone
 * else's household" -- deliberately the same answer, so a caller cannot use
 * this to test whether an id exists (see ChildAccessError's own note).
 *
 * Everything after the lock runs inside one transaction: the cooldown is
 * read and the assignment written as one step, so two taps a millisecond
 * apart cannot both pass a cooldown check that only one of them should.
 */
export const assignAnnualPass = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { childId: string }) => {
    if (!input?.childId) throw new Error("お子さまの情報が見つかりません");
    return { childId: input.childId };
  })
  .handler(async ({ context, data }): Promise<AssignResult> => {
    const nowIso = new Date().toISOString();
    return withTransaction(async (tx) => {
      const householdId = await resolveHouseholdId(tx, context.userId, nowIso);
      return withHouseholdLock(tx, householdId, async () => {
        const derived = await recomputeSubscription(tx, householdId, nowIso);
        // Only an annual pass is assignable. A buyout covers everyone (so
        // there is nothing to assign), and a trial or lapsed household has
        // no pass to move.
        if (derived.plan !== "annual") return { error: { code: "NOT_ANNUAL" } as const };

        const child = await findOwnedChild(tx, householdId, data.childId, context.userId);
        if (!child) return { error: { code: "CHILD_NOT_FOUND" } as const };

        const coverage = await readCoverage(tx, householdId);
        const cooldown = cooldownStateOf(coverage.coveredAssignedAt, nowIso);
        // Re-picking the child who already holds it is a no-op, not a
        // reassignment, and must not burn the cooldown or log an audit row.
        if (coverage.coveredChildId === child.id) return { ok: true as const };
        if (cooldown.blocked) {
          return { error: { code: "COOLDOWN_ACTIVE", nextAllowedAt: cooldown.nextAllowedAt } as const };
        }

        await tx`
          update household
          set covered_child_id = ${child.id}, covered_assigned_at = ${nowIso}
          where id = ${householdId}
        `;
        // Support needs to be able to answer "who had the pass in March".
        // admin_action is append-only and already survives every recompute
        // (it is an input to the derivation, not an output of it), which is
        // why the history lives here rather than in a table that a
        // recompute could rewrite.
        await tx`
          insert into admin_action (id, household_id, type, days, reason, actor)
          values (${crypto.randomUUID()}, ${householdId}, 'pass_reassigned', null, 'parent reassignment', ${`parent:${context.userId}`})
        `;
        return { ok: true as const };
      });
    });
  });

export type PassAssignment = {
  /** 'annual' is the only plan with anything to assign; the card renders for no other. */
  plan: Plan | null;
  coveredChildId: string | null;
  /** Null when the pass may be moved now (including the exempt first assignment). */
  cooldownUntil: string | null;
};

/**
 * What the parent surface needs to render the assignment card. Parent-only:
 * nothing here is ever read by a child surface, which must not learn that a
 * plan, a pass, or a sibling's claim on it exists.
 */
export const getPassAssignment = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<PassAssignment> => {
    const sql = await getSql();
    const nowIso = new Date().toISOString();
    const householdId = await resolveHouseholdId(sql, context.userId, nowIso);
    const derived = await recomputeSubscription(sql, householdId, nowIso);
    const coverage = await readCoverage(sql, householdId);
    return {
      plan: derived.plan,
      coveredChildId: coverage.coveredChildId,
      cooldownUntil: cooldownStateOf(coverage.coveredAssignedAt, nowIso).nextAllowedAt,
    };
  });
