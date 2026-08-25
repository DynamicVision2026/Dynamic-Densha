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

export const listChildren = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      name: string;
      grade: number;
      created_at: string | Date;
      start_band: string | null;
    }>`
      select id, name, grade, created_at, start_band
      from children
      where user_id = ${context.userId}
      order by created_at asc
    `;
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      grade: r.grade as Grade,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      startBand: parseStartBand(r.start_band) ?? "beginning",
    })) satisfies ChildRow[];
  });

export const createChild = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { name: string; grade: number; startBand?: string }) => {
    const name = input.name.trim().slice(0, 20);
    const grade = Number(input.grade);
    if (!name) throw new Error("なまえを入れてください");
    if (!Number.isInteger(grade) || grade < 1 || grade > 6) {
      throw new Error("学年が正しくありません");
    }
    return {
      name,
      grade: grade as Grade,
      startBand: parseStartBand(input.startBand) ?? "beginning",
    };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const existing = await sql<{ c: number }>`
      select count(*)::int as c from children where user_id = ${context.userId}
    `;
    if ((existing[0]?.c ?? 0) >= 6) throw new Error("こどもは6人までです");
    const id = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const ordered = orderedKanjiForGrade(data.grade);
    const cursor = startIndexFor(data.startBand, ordered.length);
    const weekStart = tokyoWeekStart(nowIso);
    const newKanji = pickWeeklyNew(ordered, cursor, DEFAULT_WEEKLY_NEW, new Map());
    await sql`
      insert into children (
        id, user_id, name, grade, start_band, weekly_new_cap, plan_week_start, plan_cursor, plan_new_kanji
      )
      values (
        ${id}, ${context.userId}, ${data.name}, ${data.grade}, ${data.startBand},
        ${DEFAULT_WEEKLY_NEW}, ${weekStart}, ${cursor}, ${JSON.stringify(newKanji)}
      )
    `;
    const route = await insertGradeRoute(context.userId, id, data.grade, data.startBand, nowIso);
    await sql`
      update children set active_grade_route_id = ${route.id}
      where id = ${id} and user_id = ${context.userId}
    `;
    return {
      id,
      name: data.name,
      grade: data.grade,
      createdAt: nowIso,
      startBand: data.startBand,
    } satisfies ChildRow;
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
