import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, withTransaction } from "@/lib/db";
import { childQuota } from "@/lib/entitlement";
import { normalizeChildName } from "@/lib/child-name";
import { resolveHouseholdId } from "@/lib/server/household";
import { withHouseholdLock } from "@/lib/server/household-lock";
import { findOwnedChild, readCoverage } from "@/lib/server/coverage";
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
  /** Only selected where the orphan repair needs it; absent elsewhere. */
  household_id?: string | null;
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

    // Household first, so a second parent in the same household (see
    // joinHousehold) sees the same children.
    //
    // The second clause is the repair for a real outage. An earlier version
    // of this query scoped by household_id ALONE, with a comment arguing that
    // a child whose household_id never got backfilled "must be visible to
    // nobody rather than to whoever shares its user_id". That reasoning was
    // wrong twice over. The leak it guarded against cannot happen -- user_id
    // is the child's creator, and a creator belongs to exactly one household,
    // so a row matched this way can only ever be this family's own. And the
    // failure it chose instead is far worse than the one it avoided: a parent
    // with two children saw zero, and /app/parent sent them to onboarding.
    //
    // That is not hypothetical. The deploy pipeline applies migrations before
    // the new revision takes traffic, so between 0014 landing and the new
    // createChild going live there was a window where children were written
    // with a NULL household_id. Every future migration that adds a column the
    // new code populates has the same window; this clause is what makes it
    // survivable rather than an outage.
    const rows = await sql<ChildDbRow>`
      select id, name, grade, created_at, start_band, household_id
      from children
      where archived_at is null
        and (household_id = ${householdId}
             or (household_id is null and user_id = ${context.userId}))
      order by created_at asc
    `;

    // Heal what we just had to reach for, so the fallback stops firing and
    // the row is visible to a co-parent too. Best-effort on purpose: a failure
    // here must not cost the parent the list they asked for.
    const orphaned = rows.filter((r) => r.household_id == null).map((r) => r.id);
    if (orphaned.length > 0) {
      try {
        await sql`
          update children set household_id = ${householdId}
          where user_id = ${context.userId} and household_id is null
        `;
      } catch {
        /* the read already succeeded; the next visit will try again */
      }
    }

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
      if (!name) throw new Error("お名前を入力してください");
      if (!Number.isInteger(grade) || grade < 1 || grade > 6) {
        throw new Error("学年の指定が正しくありません");
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
    if (!name) throw new Error("お名前を入力してください");
    if (!input.childId) throw new Error("お子さまの情報が見つかりません");
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
    if (!rows[0]) throw new Error("お子さまの情報が見つかりません");
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
    if (!input.childId) throw new Error("お子さまの情報が見つかりません");
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
        if ((activeCount[0]?.c ?? 0) <= 1) throw new Error("最後のお一人は非表示にできません");

        const rows = await tx<{ id: string }>`
          update children set archived_at = now()
          where id = ${data.childId} and household_id = ${householdId} and archived_at is null
          returning id
        `;
        if (!rows[0]) throw new Error("お子さまの情報が見つかりません");

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
    if (!child) throw new Error("お子さまの情報が見つかりません");
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

export type ChildGradeError =
  | { code: "CHILD_NOT_FOUND" }
  | { code: "INVALID_GRADE"; grade: number }
  | { code: "SAME_GRADE"; grade: Grade };

export type ChildGradeResult = { ok: true; grade: Grade } | { error: ChildGradeError };

/**
 * Move a child to a different school year.
 *
 * This is the CORRECTION path -- a parent who picked 小4 at signup meaning
 * 小1 -- and it is deliberately not confirmGradeRollover below. That one is
 * the April +1 advance and keeps its canAdvanceGrade cap; this one goes in
 * either direction and to any year, because the mistake it exists to fix can
 * be in either direction.
 *
 * WHAT IT TOUCHES, exhaustively: it archives the child's current grade_routes
 * row, inserts a new one for the target year, and rewrites the three plan_*
 * columns on `children` (the week's new-character list has to come from the
 * new year's curriculum or the child is handed characters from a year they
 * are no longer on).
 *
 * WHAT IT MUST NOT TOUCH, and does not:
 *   - kanji_progress. Not a row, not a column. Mastery is a property of the
 *     CHARACTER and the child, never of the year they were filed under when
 *     they learned it, so no status is recomputed and no green car turns any
 *     other colour.
 *   - echo scheduling. echo_due_at, echo_success_count and last_success_by_kind
 *     all live in kanji_progress; a review that was due on Thursday is still
 *     due on Thursday afterwards.
 *   - child_stamps. The cumulative 「これまでのかんぺき」 count is append-only
 *     and survives every grade change, which is exactly what the confirmation
 *     promises the parent: 「学年を変更しても、これまでのかんぺきな記録は
 *     消えません」.
 *
 * The progress map is READ (pickWeeklyNew consults it so the new week does
 * not hand back characters this child already mastered) and never written.
 *
 * Under the household lock inside one transaction: `children` and
 * `grade_routes` are written together, and a half-applied change leaves a
 * child pointing at an archived route.
 */
export const setChildGrade = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { childId: string; grade: number }) => {
    if (!input?.childId) throw new Error("お子さまの情報が見つかりません");
    return { childId: input.childId, grade: Number(input.grade) };
  })
  .handler(async ({ context, data }): Promise<ChildGradeResult> => {
    if (!Number.isInteger(data.grade) || data.grade < 1 || data.grade > 6) {
      return { error: { code: "INVALID_GRADE", grade: data.grade } };
    }
    const grade = data.grade as Grade;
    const nowIso = new Date().toISOString();
    const sql = await getSql();
    const householdId = await resolveHouseholdId(sql, context.userId, nowIso);

    // Ownership before anything else, and 404-shaped: a childId from another
    // household must be indistinguishable from one that does not exist.
    const owned = await findOwnedChild(sql, householdId, data.childId, context.userId);
    if (!owned) return { error: { code: "CHILD_NOT_FOUND" } };
    if (owned.grade === grade) return { error: { code: "SAME_GRADE", grade } };

    // Read outside the transaction: it is a large per-child map and only
    // informs which characters this week offers, so holding the household
    // lock across it would serialise every other household mutation behind a
    // read that changes nothing.
    const { map } = await loadProgress(context.userId, data.childId);
    const ordered = orderedKanjiForGrade(grade);
    const cursor = startIndexFor("beginning", ordered.length);
    const weekStart = tokyoWeekStart(nowIso);
    const newKanji = pickWeeklyNew(ordered, cursor, DEFAULT_WEEKLY_NEW, map);

    await withTransaction(async (tx) => {
      await withHouseholdLock(tx, householdId, async () => {
        const current = await tx<{ active_grade_route_id: string | null }>`
          select active_grade_route_id from children
          where id = ${data.childId} and household_id = ${householdId}
        `;
        const routeId = crypto.randomUUID();
        await tx`
          insert into grade_routes (id, user_id, child_id, grade, ordered_kanji, start_index, start_band, created_at)
          values (
            ${routeId}, ${context.userId}, ${data.childId}, ${grade},
            ${JSON.stringify(ordered)}, ${cursor}, ${"beginning"}, ${nowIso}
          )
        `;
        const previousRouteId = current[0]?.active_grade_route_id ?? null;
        if (previousRouteId) {
          // Archived, never deleted -- the Day-one snapshot of what the child
          // was working through is the only record of it.
          await tx`
            update grade_routes
            set archived_at = ${nowIso}, superseded_by = ${routeId}
            where id = ${previousRouteId} and user_id = ${context.userId}
          `;
        }
        await tx`
          update children
          set grade = ${grade},
              start_band = 'beginning',
              active_grade_route_id = ${routeId},
              plan_week_start = ${weekStart},
              plan_cursor = ${cursor},
              plan_new_kanji = ${JSON.stringify(newKanji)}
          where id = ${data.childId} and household_id = ${householdId}
        `;
      });
    });

    return { ok: true, grade };
  });

export const confirmGradeRollover = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { childId: string }) => {
    if (!input.childId) throw new Error("お子さまの情報が見つかりません");
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
