import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
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
    const rows = await sql<ChildDbRow>`
      select id, name, grade, created_at, start_band
      from children
      where user_id = ${context.userId} and archived_at is null
      order by created_at asc
    `;
    return rows.map(toChildRow) satisfies ChildRow[];
  });

export const createChild = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { name: string; grade: number; startBand?: string; idempotencyKey: string }) => {
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
    };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();

    // A retry of the exact same submission (double-tap, or a client retry
    // after a dropped response) carries the same client-generated
    // idempotencyKey (see src/routes/onboard.tsx) -- return the row that
    // request already created instead of making a second child.
    const already = await sql<ChildDbRow>`
      select id, name, grade, created_at, start_band from children
      where user_id = ${context.userId} and idempotency_key = ${data.idempotencyKey}
    `;
    if (already[0]) return toChildRow(already[0]);

    const existing = await sql<{ c: number }>`
      select count(*)::int as c from children where user_id = ${context.userId} and archived_at is null
    `;
    if ((existing[0]?.c ?? 0) >= 6) throw new Error("こどもは6人までです");

    const id = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const ordered = orderedKanjiForGrade(data.grade);
    const cursor = startIndexFor(data.startBand, ordered.length);
    const weekStart = tokyoWeekStart(nowIso);
    const newKanji = pickWeeklyNew(ordered, cursor, DEFAULT_WEEKLY_NEW, new Map());
    const inserted = await sql<ChildDbRow>`
      insert into children (
        id, user_id, name, grade, start_band, weekly_new_cap, plan_week_start, plan_cursor, plan_new_kanji, idempotency_key
      )
      values (
        ${id}, ${context.userId}, ${data.name}, ${data.grade}, ${data.startBand},
        ${DEFAULT_WEEKLY_NEW}, ${weekStart}, ${cursor}, ${JSON.stringify(newKanji)}, ${data.idempotencyKey}
      )
      on conflict (user_id, idempotency_key) do nothing
      returning id, name, grade, created_at, start_band
    `;

    if (!inserted[0]) {
      // Conflict: a concurrent request carrying the same key already won
      // the race (the true double-tap case -- two near-simultaneous
      // requests, not one request retried after the first's response
      // already landed). Re-select rather than assume our own insert
      // applies, and skip re-creating the grade route -- the winner
      // already did.
      const row = (
        await sql<ChildDbRow>`
          select id, name, grade, created_at, start_band from children
          where user_id = ${context.userId} and idempotency_key = ${data.idempotencyKey}
        `
      )[0];
      if (!row) throw new Error("こどもの保存に失敗しました");
      return toChildRow(row);
    }

    const route = await insertGradeRoute(context.userId, id, data.grade, data.startBand, nowIso);
    await sql`
      update children set active_grade_route_id = ${route.id}
      where id = ${id} and user_id = ${context.userId}
    `;
    return toChildRow(inserted[0]);
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
    const rows = await sql<{ id: string }>`
      update children set name = ${data.name}
      where id = ${data.childId} and user_id = ${context.userId} and archived_at is null
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
    const sql = await getSql();
    const activeCount = await sql<{ c: number }>`
      select count(*)::int as c from children where user_id = ${context.userId} and archived_at is null
    `;
    if ((activeCount[0]?.c ?? 0) <= 1) throw new Error("最後の1人は非表示にできません");
    const rows = await sql<{ id: string }>`
      update children set archived_at = now()
      where id = ${data.childId} and user_id = ${context.userId} and archived_at is null
      returning id
    `;
    if (!rows[0]) throw new Error("こどもが見つかりません");
    return { ok: true as const };
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
