import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { resolveHouseholdId } from "@/lib/server/household";
import { getParentTrialBanner, isHouseholdActive } from "@/lib/server/subscription";
import { getKanji, type Grade } from "@/data/kyoiku";
import { assertOwnedChild, getChildEntitlement } from "@/lib/server/coverage";
import { decorateTrains } from "@/lib/trains";
import type { MasteryStatus } from "@/lib/mastery";
import { getGradeParams } from "@/lib/grade-params";
import { parseGrade } from "@/lib/grade-nav";
import {
  echoAvailable,
  echoIsDue,
  emptyProgress,
  nextArrivalFrom,
  utcDay,
} from "@/lib/progress-eval";
import { jaArrivalT } from "@/lib/echo-arrival";
import { mapLinesFor } from "@/lib/lines";
import { buildParentReport, type ReportEvent } from "@/lib/parent-report";
import { pickWeekPeek } from "@/lib/week-peek";
import { buildDepartureBoard } from "@/lib/departure-board";
import { buildForwardMetrics } from "@/lib/parent-forward";
import { buildProjectedArrival } from "@/lib/projected-arrival";
import { canAdvanceGrade, shouldShowAprilPrompt } from "@/lib/grade-rollover";
import { buildWeeklyPlan, tokyoWeekStart } from "@/lib/weekly-plan";
import { buildGradeRings } from "@/lib/train-overview";
import {
  ensureChildPlan,
  listChildRoutes,
  loadChildRoute,
  loadInspections,
} from "@/lib/server/grade-route";
import {
  assertChildCanRideForCaller,
  iso,
  listStamps,
  loadProgress,
  paramsForChar,
} from "@/lib/server/progress-store";
import {
  runCompleteEncounter,
  runCompleteUnderstand,
  runSubmitPractice,
} from "@/lib/server/progress-write";

export type { TrainView } from "@/lib/trains";
export type { ProgressState } from "@/lib/progress-eval";
export { loadProgress, saveProgress } from "@/lib/server/progress-store";

function asBool(v: unknown): boolean {
  return v === true || v === "t" || v === "true" || v === 1 || v === "1";
}

async function echoStartsToday(userId: string, childId: string, nowIso: string) {
  const sql = await getSql();
  const day = utcDay(nowIso);
  const rows = await sql<{ n: number }>`
    select count(distinct session_id)::int as n
    from practice_events
    where user_id = ${userId}
      and child_id = ${childId}
      and is_echo = true
      and created_at >= ${`${day}T00:00:00.000Z`}::timestamptz
  `;
  return Number(rows[0]?.n ?? 0);
}

export const getHomeState = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { childId: string; grade?: number }) => input)
  .handler(async ({ context, data }) => {
    const { child, map } = await loadProgress(context.userId, data.childId);
    const now = new Date().toISOString();
    const viewGrade = parseGrade(data.grade) ?? child.grade;
    const p = getGradeParams(child.grade);
    const started = await echoStartsToday(context.userId, data.childId, now);
    const trains = decorateTrains(viewGrade, map).map((t) => ({
      ...t,
      cars: t.cars.map((car) => ({
        ...car,
        echoDue: echoIsDue(map.get(car.char) ?? emptyProgress(car.char), now),
        echoDueAt: (map.get(car.char) ?? emptyProgress(car.char)).echoDueAt,
      })),
    }));
    const total = trains.reduce((n, t) => n + t.cars.length, 0);
    const gradeChars = new Set(trains.flatMap((t) => t.chars));
    const perfect = [...map.values()].filter(
      (row) => row.status === "perfect" && gradeChars.has(row.kanji),
    ).length;
    const echoQueue = [...map.values()]
      .filter((row) => echoAvailable(row, now, started, p))
      .slice(0, Math.max(0, p.echo_per_day_cap - started));
    const seenToday = [...map.values()].filter(
      (row) => row.seenAt && utcDay(row.seenAt) === utcDay(now),
    ).length;
    const routeRow = await loadChildRoute(context.userId, data.childId);
    const ensured = await ensureChildPlan(context.userId, routeRow, map, now);
    const inspections = await loadInspections(context.userId, data.childId);
    const weekly = buildWeeklyPlan({
      route: ensured.route,
      plan: ensured.plan,
      progress: map,
      inspections,
      weeklyNewCap: routeRow.weeklyNewCap,
      nowIso: now,
    });
    const board =
      viewGrade === child.grade
        ? buildDepartureBoard({ progress: map, inspections, plan: weekly, nowIso: now })
        : null;
    const rings = buildGradeRings({ progress: map, profileGrade: child.grade });
    const sqlForEntitlement = await getSql();
    const householdId = await resolveHouseholdId(sqlForEntitlement, context.userId);
    // Per child. On an annual pass this is what makes the uncovered
    // sibling's board render read-only (canView stays true, canRide goes
    // false) rather than showing them a live boarding pass they cannot use.
    const entitlement = await getChildEntitlement(sqlForEntitlement, householdId, data.childId, now);
    return {
      child,
      viewGrade,
      trains,
      total,
      perfect,
      echoQueue: viewGrade === child.grade ? echoQueue : [],
      seenToday,
      maxNew: p.max_new_per_day,
      peek: pickWeekPeek({ progress: map, grade: viewGrade }),
      board,
      rings,
      entitlement,
    };
  });

export const getKanjiStudy = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { childId: string; char: string }) => input)
  .handler(async ({ context, data }) => {
    // Commerce spec §3.1/§13 rule 4: a lapsed household must not be able to
    // open a ride at all, not merely fail to write progress at the end of
    // one. This is the study payload the session mounts with, so it's
    // gated here, not just at the final answer.
    //
    // Per CHILD, not per household: on an annual pass the household is
    // entitled and the uncovered sibling is not, so a household-level gate
    // would let anyone in the family ride on one child's pass. Ownership is
    // checked first and answers 404, so a guessed id from another household
    // cannot be distinguished from one that does not exist.
    await assertChildCanRideForCaller(context.userId, data.childId);
    const { child, map } = await loadProgress(context.userId, data.childId);
    const now = new Date().toISOString();
    const p = paramsForChar(data.char, child.grade);
    const started = await echoStartsToday(context.userId, data.childId, now);
    const progress = map.get(data.char) ?? emptyProgress(data.char);
    const charGrade = (getKanji(data.char)?.grade ?? child.grade) as Grade;
    const rings = buildGradeRings({ progress: map, profileGrade: child.grade });
    return {
      child,
      progress,
      nextArrival: nextArrivalFrom(progress, now, jaArrivalT),
      unlocked: true,
      echoOn: echoAvailable(progress, now, started, p),
      gradePerfect: rings.find((r) => r.grade === charGrade)?.perfect ?? 0,
    };
  });

export const completeEncounter = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { childId: string; char: string }) => input)
  .handler(async ({ context, data }) => runCompleteEncounter(context.userId, data.childId, data.char));

export const completeUnderstand = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { childId: string; char: string }) => input)
  .handler(async ({ context, data }) => runCompleteUnderstand(context.userId, data.childId, data.char));

export const submitPractice = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: {
    childId: string;
    char: string;
    itemId: string;
    choiceId: string;
    isEcho: boolean;
    echoBatchDone: boolean;
    sessionId: string;
  }) => input)
  .handler(async ({ context, data }) => runSubmitPractice(context.userId, data));

export const listMistakes = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((childId: string) => childId)
  .handler(async ({ context, data: childId }) => {
    const sql = await getSql();
    // Ownership first, for the same reason every other child-scoped read does
    // it: filtering the rows by user_id would keep a stranger out, but would
    // also hide a co-parent's children from them once a second parent joins
    // a household. 404 either way -- never a 403.
    const householdId = await resolveHouseholdId(sql, context.userId);
    await assertOwnedChild(sql, householdId, childId, context.userId);
    const rows = await sql<{
      kanji: string;
      kind: string;
      answer: string;
      created_at: string | Date;
    }>`
      select kanji, kind, answer, created_at
      from practice_events
      where child_id = ${childId} and correct = false
      order by created_at desc
      limit 40
    `;
    return rows.map((r) => ({
      kanji: r.kanji,
      kind: r.kind,
      answer: r.answer,
      created_at: iso(r.created_at) ?? "",
    }));
  });

export const getParentOverview = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((childId: string) => childId)
  .handler(async ({ context, data: childId }) => {
    const { child, map } = await loadProgress(context.userId, childId);
    const trains = decorateTrains(child.grade, map);
    const counts: Record<MasteryStatus, number> = {
      new: 0,
      lost: 0,
      fix: 0,
      almost: 0,
      perfect: 0,
    };
    let total = 0;
    for (const t of trains) {
      for (const car of t.cars) {
        total += 1;
        counts[car.status] += 1;
      }
    }
    const sql = await getSql();
    const recent = await sql<{
      kanji: string;
      kind: string;
      correct: boolean;
      created_at: string | Date;
      is_echo: boolean;
      session_id: string;
      answer: string;
    }>`
      select kanji, kind, correct, created_at, is_echo, session_id, answer
      from practice_events
      where user_id = ${context.userId} and child_id = ${childId}
      order by created_at desc
      limit 200
    `;
    const events: ReportEvent[] = recent.map((ev) => ({
      kanji: ev.kanji,
      kind: ev.kind,
      correct: asBool(ev.correct),
      created_at: iso(ev.created_at) ?? "",
      is_echo: asBool(ev.is_echo),
      session_id: String(ev.session_id ?? ""),
      answer: String(ev.answer ?? ""),
    }));
    const nowIsoForWeek = new Date().toISOString();
    const stamps = await listStamps(context.userId, childId);

    // 今週の乗車記録. Aggregated in SQL rather than derived from the 200-event
    // window above: "days ridden" and "first met this week" are both questions
    // about the whole history, and a window that a busy week can overflow
    // would quietly under-report exactly the families who used the app most.
    //
    // Tokyo dates, not UTC: a session at 08:00 JST is Monday to the family and
    // Sunday to the database, and a parent counting their child's week must
    // get the family's answer.
    const weekStartDate = tokyoWeekStart(nowIsoForWeek);
    const rhythmRows = await sql<{ days: number; new_met: number }>`
      with in_week as (
        select kanji, created_at
        from practice_events
        where child_id = ${childId}
          and (created_at at time zone 'Asia/Tokyo')::date >= ${weekStartDate}::date
      ),
      first_seen as (
        select kanji, min(created_at) as first_at
        from practice_events
        where child_id = ${childId}
        group by kanji
      )
      select
        (select count(distinct (created_at at time zone 'Asia/Tokyo')::date) from in_week)::int as days,
        (select count(*) from first_seen
          where (first_at at time zone 'Asia/Tokyo')::date >= ${weekStartDate}::date)::int as new_met
    `;
    const weekRhythm = {
      daysRidden: rhythmRows[0]?.days ?? 0,
      newMet: rhythmRows[0]?.new_met ?? 0,
      // まよい and なおし together: from a parent's side they are one thing
      // ("needs another go"), and splitting them invites reading one of the
      // two as failure.
      reviewDue: counts.lost + counts.fix,
    };

    const report = buildParentReport({
      grade: child.grade,
      progress: map,
      events,
      stamps,
    });
    const nowIso = new Date().toISOString();
    const routeRow = await loadChildRoute(context.userId, childId);
    const ensured = await ensureChildPlan(context.userId, routeRow, map, nowIso);
    const inspections = await loadInspections(context.userId, childId);
    const weekly = buildWeeklyPlan({
      route: ensured.route,
      plan: ensured.plan,
      progress: map,
      inspections,
      weeklyNewCap: routeRow.weeklyNewCap,
      nowIso,
    });
    const forward = buildForwardMetrics({
      route: ensured.route,
      plan: weekly,
      progress: map,
      events,
      inspections,
      nowIso,
    });
    const arrival = buildProjectedArrival({
      route: ensured.route,
      progress: map,
      events,
      nowIso,
      weeklyNewCap: routeRow.weeklyNewCap,
    });
    const allRoutes = await listChildRoutes(context.userId, childId);
    const history = allRoutes.filter((r) => r.id !== ensured.route.id);
    const householdId = await resolveHouseholdId(sql, context.userId, nowIso);
    const trialBanner = await getParentTrialBanner(sql, householdId, nowIso);
    // Powers the /app/parent?checkout=pending poll (src/routes/app/parent.tsx):
    // it needs to know specifically when a webhook has landed and moved this
    // household to 'active', which trialBanner's kind alone can't say (kind
    // "none" covers both "never trialed" and "already active").
    const subscriptionActive = await isHouseholdActive(sql, householdId, nowIso);
    return {
      child: { ...child, startBand: routeRow.startBand },
      trialBanner,
      subscriptionActive,
      trains,
      counts: report.counts,
      total,
      perfect: counts.perfect,
      started: map.size,
      recent: events.slice(0, 12),
      stamps,
      // Cumulative 「これまでのかんぺき」. child_stamps is append-only and
      // written only on justReachedPerfect, so this is every car that has
      // EVER turned green -- it survives a grade change and an echo the child
      // later fails, which is exactly what the hero metric promises.
      stampCount: stamps.length,
      weekRhythm,
      lines: report.lines.map((line) => ({
        id: line.id,
        label: line.label,
        type: line.type,
        done: line.perfect,
        total: line.total,
      })),
      report,
      route: ensured.route,
      plan: weekly,
      forward,
      progress: Object.fromEntries(map),
      history,
      arrival,
      canRollover: canAdvanceGrade(child.grade),
      aprilPrompt: shouldShowAprilPrompt({
        grade: child.grade,
        nowIso,
        dismissedSy: routeRow.rolloverDismissedSy,
      }),
    };
  });

export const getMapState = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { childId: string; grade?: number }) => input)
  .handler(async ({ context, data }) => {
    const { child, map } = await loadProgress(context.userId, data.childId);
    const now = new Date().toISOString();
    const viewGrade = parseGrade(data.grade) ?? child.grade;
    const lines = mapLinesFor(viewGrade).map((view) => ({
      ...view,
      stations: view.stations.map((station) => ({
        ...station,
        status: map.get(station.kanji)?.status ?? "new",
        echoDue: echoIsDue(map.get(station.kanji) ?? emptyProgress(station.kanji), now),
        echoDueAt: (map.get(station.kanji) ?? emptyProgress(station.kanji)).echoDueAt,
      })),
    }));
    return { child, viewGrade, lines };
  });

export const getStampBook = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((childId: string) => childId)
  .handler(async ({ context, data: childId }) => {
    const { child } = await loadProgress(context.userId, childId);
    const stamps = await listStamps(context.userId, childId);
    return { child, stamps };
  });
