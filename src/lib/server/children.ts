import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, withTransaction } from "@/lib/db";
import { childQuota } from "@/lib/entitlement";
import { normalizeChildName } from "@/lib/child-name";
import { resolveHouseholdId } from "@/lib/server/household";
import { withHouseholdLock } from "@/lib/server/household-lock";
import { readCoverage } from "@/lib/server/coverage";
import { recomputeSubscription } from "@/lib/server/subscription";
import type { Grade } from "@/data/kyoiku";
import { DEFAULT_WEEKLY_NEW, orderedKanjiForGrade, parseStartBand, startIndexFor, type StartBand } from "@/lib/grade-route";
import { insertGradeRoute, savePlan, performChildRollover, dismissRolloverPrompt } from "@/lib/server/grade-route";
import { loadProgress } from "@/lib/server/progress";
import { aprilBoundaryYear } from "@/lib/grade-rollover";
import { pickWeeklyNew, tokyoWeekStart } from "@/lib/weekly-plan";

export type ChildRow = {
  id: string;
  name: string;
  grade: Grade;
  createdAt: string;
  startBand: StartBand;
};

type ChildDbRow = {
  id: string;
  name: string;
  grade: number;
  created_at: string | Date;
  start_band: string | null;
};

function toChildRow(r: ChildDbRow): ChildRow {
  return {
    id: r.id,
    name: r.name,
    grade: r.grade as Grade,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    startBand: parseStartBand(r.start_band) ?? "beginning",
  };
}

export const listChildren = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const householdId = await resolveHouseholdId(sql, context.userId);
    // Household, not user: a second parent in the same household (see
    // joinHousehold) must see the same children, and a child whose
    // household_id somehow never got backfilled must be visible to nobody
    // rather than to whoever shares its user_id.
    const rows = await sql<ChildDbRow>`
      select id, name, grade, created_at, start_band
      from children
      where household_id = ${householdId} and archived_at is null
      order by created_at asc
    `;
    return rows.map(toChildRow) satisfies ChildRow[];
  });

export type ChildCreateError =
  | { code: "QUOTA_EXCEEDED"; limit: number; plan: string }
  | { code: "DUPLICATE_NAME"; existingChildId: string }
  | { code: "INVALID_INPUT"; field: string };

export type ChildCreateResult = { child: ChildRow } | { error: ChildCreateError };

/**
 * What the locked section decides. Tagged rather than inferred: the three
 * outcomes have different payloads and only one of them still has work to
 * do after the transaction commits.
 */
type CreateOutcome =
  | { kind: "existing"; child: ChildRow }
  | { kind: "refused"; error: ChildCreateError }
  | { kind: "created"; child: ChildRow; id: string; grade: Grade; startBand: StartBand };

/**
 * Create a child profile.
 *
 * Returns its refusals as values, not exceptions: QUOTA_EXCEEDED and
 * DUPLICATE_NAME are both states the form renders (a tier explanation, a
 * confirm-and-continue prompt), and the second is not even a refusal -- it
 * is a question. Throwing would leave the UI matching on error strings to
 * tell "you have too many children" from "are you sure about that name",
 * which is how the prompt and the condition drift apart.
 *
 * Everything below runs inside ONE transaction, under the household's
 * advisory lock. The count and the insert are two statements; without the
 * lock, two requests can both read "2 children" and both insert a third.
 * That is not hypothetical here -- the double-tap this form already
 * defends against with an idempotency key is the same race with the same
 * key, and two DIFFERENT submissions seconds apart carry two different
 * keys and sail straight past it.
 */
export const createChild = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      name: string;
      grade: number;
      startBand?: string;
      idempotencyKey: string;
      confirmDuplicateName?: boolean;
    }) => {
      const name = input.name.trim().slice(0, 20);
      const grade = Number(input.grade);
      if (!name) throw new Error("なまえを入れてください");
      if (!Number.isInteger(grade) || grade < 1 || grade > 6) {
        throw new Error("学年が正しくありません");
      }
      const idempotencyKey = input.idempotencyKey?.trim();
      if (!idempotencyKey) throw new Error("リクエストが正しくありません");
      return {
        name,
        grade: grade as Grade,
        startBand: parseStartBand(input.startBand) ?? "beginning",
        idempotencyKey,
        confirmDuplicateName: input.confirmDuplicateName === true,
      };
    },
  )
  .handler(async ({ context, data }): Promise<ChildCreateResult> => {
    const nowIso = new Date().toISOString();
    const outcome = await withTransaction<CreateOutcome>(async (tx) => {
      const householdId = await resolveHouseholdId(tx, context.userId, nowIso);

      return withHouseholdLock(tx, householdId, async () => {
        // A retry of the exact same submission (double-tap, or a client
        // retry after a dropped response) carries the same client-generated
        // idempotencyKey -- return the row that request already created
        // instead of making a second child. Checked FIRST, before the quota:
        // a retry of a request that already succeeded must never be refused
        // by a cap its own successful predecessor filled.
        const already = await tx<ChildDbRow>`
          select id, name, grade, created_at, start_band from children
          where household_id = ${householdId} and idempotency_key = ${data.idempotencyKey}
        `;
        if (already[0]) return { kind: "existing", child: toChildRow(already[0]) };

        const derived = await recomputeSubscription(tx, householdId, nowIso);
        const quota = childQuota(
          { state: derived.state, effectiveTrialEnd: derived.effectiveTrialEnd, paidUntil: derived.paidUntil },
          nowIso,
        );
        const countRows = await tx<{ c: number }>`
          select count(*)::int as c from children
          where household_id = ${householdId} and archived_at is null
        `;
        const active = countRows[0]?.c ?? 0;
        if (!quota.canCreate || active >= quota.limit) {
          return {
            kind: "refused",
            error: {
              code: "QUOTA_EXCEEDED",
              limit: quota.limit === Infinity ? -1 : quota.limit,
              plan: derived.plan ?? "trial",
            },
          };
        }

        // Soft, confirmable -- never a unique constraint. Siblings really do
        // share a name (a nickname, a second child named for the first), and
        // a database that refuses a real second child is worse than a
        // duplicate the parent can rename or archive. Normalised so
        // 「たろう」 and 「 たろう 」 are the same question.
        if (!data.confirmDuplicateName) {
          const normalized = normalizeChildName(data.name);
          const dupes = await tx<{ id: string; name: string }>`
            select id, name from children
            where household_id = ${householdId} and archived_at is null
          `;
          const match = dupes.find((c) => normalizeChildName(c.name) === normalized);
          if (match) {
            return { kind: "refused", error: { code: "DUPLICATE_NAME", existingChildId: match.id } };
          }
        }

        const id = crypto.randomUUID();
        const ordered = orderedKanjiForGrade(data.grade);
        const cursor = startIndexFor(data.startBand, ordered.length);
        const weekStart = tokyoWeekStart(nowIso);
        const newKanji = pickWeeklyNew(ordered, cursor, DEFAULT_WEEKLY_NEW, new Map());
        const inserted = await tx<ChildDbRow>`
          insert into children (
            id, user_id, household_id, name, grade, start_band,
            weekly_new_cap, plan_week_start, plan_cursor, plan_new_kanji, idempotency_key
          )
          values (
            ${id}, ${context.userId}, ${householdId}, ${data.name}, ${data.grade}, ${data.startBand},
            ${DEFAULT_WEEKLY_NEW}, ${weekStart}, ${cursor}, ${JSON.stringify(newKanji)}, ${data.idempotencyKey}
          )
          on conflict (user_id, idempotency_key) do nothing
          returning id, name, grade, created_at, start_band
        `;
        if (!inserted[0]) {
          // The unique index is on (user_id, idempotency_key) and the lock
          // is on the household, so a second parent in the same household
          // reusing a key is the one conflict the lock does not serialise.
          const row = (
            await tx<ChildDbRow>`
              select id, name, grade, created_at, start_band from children
              where user_id = ${context.userId} and idempotency_key = ${data.idempotencyKey}
            `
          )[0];
          if (!row) throw new Error("こどもの保存に失敗しました");
          return { kind: "existing", child: toChildRow(row) };
        }

        // An annual household whose pass has never been assigned, creating
        // its first child: assign it to them. Nobody has to choose between
        // one option, and an unassigned pass covers no one -- leaving it
        // null here would mean a family who paid sees their only child
        // locked out until they visit the parent surface.
        //
        // `active === 0` (the count taken above, before this insert) is the
        // "only child" test. A household with an existing child never
        // auto-assigns: moving a pass off a sibling silently is exactly what
        // §3.3 forbids.
        if (derived.plan === "annual" && active === 0) {
          const coverage = await readCoverage(tx, householdId);
          if (coverage.coveredChildId === null) {
            await tx`
              update household
              set covered_child_id = ${id}, covered_assigned_at = ${nowIso}
              where id = ${householdId} and covered_child_id is null
            `;
          }
        }

        return { kind: "created", child: toChildRow(inserted[0]), id, grade: data.grade, startBand: data.startBand };
      });
    });

    if (outcome.kind === "refused") return { error: outcome.error };
    if (outcome.kind === "existing") return { child: outcome.child };

    // Outside the transaction on purpose: the grade route is a large,
    // per-child snapshot write with no bearing on the quota or the
    // assignment, and holding the household lock across it would serialise
    // every other household mutation behind it for no safety gain. A
    // failure here leaves a child with no active route, which the route
    // loader already handles by building one on demand.
    const sql = await getSql();
    const route = await insertGradeRoute(context.userId, outcome.id, outcome.grade, outcome.startBand, nowIso);
    await sql`
      update children set active_grade_route_id = ${route.id}
      where id = ${outcome.id} and user_id = ${context.userId}
    `;
    return { child: outcome.child };
  });

/** Rename a child's nickname -- never touches progress, plan, or route state. */
export const renameChild = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { childId: string; name: string }) => {
    const name = input.name.trim().slice(0, 20);
    if (!name) throw new Error("なまえを入れてください");
    if (!input.childId) throw new Error("こどもが見つかりません");
    return { childId: input.childId, name };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const householdId = await resolveHouseholdId(sql, context.userId);
    const rows = await sql<{ id: string }>`
      update children set name = ${data.name}
      where id = ${data.childId} and household_id = ${householdId} and archived_at is null
      returning id
    `;
    if (!rows[0]) throw new Error("こどもが見つかりません");
    return { ok: true as const };
  });

/**
 * Soft delete: hides a test/unwanted profile from listChildren (and
 * therefore from every parent-facing surface) without deleting its row or
 * any historical progress -- archived_at is trivially reversible by a
 * direct update, unlike the hard delete in migrations/0013_child_lifecycle.
 * Refuses to archive a household's last remaining active child so a parent
 * can never accidentally strand themselves back at onboarding with no
 * visible profile and no way to un-hide one.
 */
export const archiveChild = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { childId: string }) => {
    if (!input.childId) throw new Error("こどもが見つかりません");
    return { childId: input.childId };
  })
  .handler(async ({ context, data }) => {
    const nowIso = new Date().toISOString();
    return withTransaction(async (tx) => {
      const householdId = await resolveHouseholdId(tx, context.userId, nowIso);
      return withHouseholdLock(tx, householdId, async () => {
        const activeCount = await tx<{ c: number }>`
          select count(*)::int as c from children
          where household_id = ${householdId} and archived_at is null
        `;
        if ((activeCount[0]?.c ?? 0) <= 1) throw new Error("最後の1人は非表示にできません");

        const rows = await tx<{ id: string }>`
          update children set archived_at = now()
          where id = ${data.childId} and household_id = ${householdId} and archived_at is null
          returning id
        `;
        if (!rows[0]) throw new Error("こどもが見つかりません");

        // If the archived child held the annual pass, the coverage is
        // CLEARED, not moved. Silently handing the pass to whichever sibling
        // happens to be next would be the app making a spending decision on
        // the family's behalf, and the sibling it picked would start riding
        // without anyone choosing that. Cleared means nobody rides until the
        // parent assigns it, which is visible, reversible, and theirs.
        //
        // covered_assigned_at is left alone deliberately: archiving a child
        // must not become a way to reset the 30-day cooldown.
        const cleared = await tx<{ id: string }>`
          update household set covered_child_id = null
          where id = ${householdId} and covered_child_id = ${data.childId}
          returning id
        `;
        return { ok: true as const, coverageCleared: cleared.length > 0 };
      });
    });
  });

/** Change 乗りはじめ without wiping mastery or rewriting the Day-one route snapshot. */
export const updateStartBand = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { childId: string; startBand: string }) => {
    const startBand = parseStartBand(input.startBand);
    if (!startBand) throw new Error("乗りはじめが正しくありません");
    return { childId: input.childId, startBand };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const rows = await sql<{ grade: number; active_grade_route_id: string | null }>`
      select grade, active_grade_route_id from children
      where id = ${data.childId} and user_id = ${context.userId}
    `;
    const child = rows[0];
    if (!child) throw new Error("こどもが見つかりません");
    const grade = child.grade as Grade;
    const ordered = orderedKanjiForGrade(grade);
    const cursor = startIndexFor(data.startBand, ordered.length);
    const nowIso = new Date().toISOString();
    const weekStart = tokyoWeekStart(nowIso);
    const { map } = await loadProgress(context.userId, data.childId);
    const newKanji = pickWeeklyNew(ordered, cursor, DEFAULT_WEEKLY_NEW, map);
    await sql`
      update children
      set start_band = ${data.startBand}
      where id = ${data.childId} and user_id = ${context.userId}
    `;
    await savePlan(context.userId, data.childId, { weekStart, cursor, newKanji });
    return { ok: true as const, startBand: data.startBand };
  });

export const confirmGradeRollover = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { childId: string }) => {
    if (!input.childId) throw new Error("こどもが見つかりません");
    return { childId: input.childId };
  })
  .handler(async ({ context, data }) => {
    return performChildRollover(context.userId, data.childId);
  });

export const dismissGradeRollover = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { childId: string; nowIso?: string }) => ({
    childId: input.childId,
    nowIso: input.nowIso,
  }))
  .handler(async ({ context, data }) => {
    const year = aprilBoundaryYear(data.nowIso ?? new Date().toISOString());
    if (year != null) await dismissRolloverPrompt(context.userId, data.childId, year);
    return { ok: true as const };
  });
