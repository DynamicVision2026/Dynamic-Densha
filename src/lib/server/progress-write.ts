import { getSql, type Sql } from "@/lib/db";
import { getKanji } from "@/data/kyoiku";
import {
  echoIsDue,
  emptyProgress,
  evaluateProgress,
  nextArrivalFrom,
} from "@/lib/progress-eval";
import { jaArrivalT } from "@/lib/echo-arrival";
import { getItem, gradeChoice, shapeSurfaceAvailable } from "@/lib/items";
import { buildGradeRings } from "@/lib/train-overview";
import { maybeRecordInspection } from "@/lib/server/grade-route";
import {
  assertChildCanRideForCaller,
  awardStamp,
  loadProgress,
  paramsForChar,
  saveProgress,
} from "@/lib/server/progress-store";
import { systemClock, type Clock } from "@/lib/server/clock";

/**
 * The write/scoring path: every place a child's mastery actually changes.
 * Kept apart from progress.ts's read-only views (getHomeState, the parent
 * report, ...) for one reason -- check-clock-single-source.mjs greps this
 * file for a direct `new Date()`/`Date.now()` and fails the build if it finds
 * one, because those views are not what the countdown-vs-scoring risk in the
 * engineering ticket is about. Every "now" in here comes from `clock`.
 *
 * `clock` defaults to systemClock, so every export here is byte-identical to
 * the pre-injection code when called with no second argument -- which is all
 * three createServerFn wrappers in progress.ts ever do. The only caller that
 * ever passes anything else is scripts/echo-clock-sequence.test.ts, in
 * process, never over the network -- see clock.ts.
 */

export async function runCompleteEncounter(
  userId: string,
  childId: string,
  char: string,
  clock: Clock = systemClock,
) {
  await assertChildCanRideForCaller(userId, childId);
  const { child, map } = await loadProgress(userId, childId);
  const now = clock.now().toISOString();
  const next = evaluateProgress(
    map.get(char) ?? emptyProgress(char),
    { type: "completeEncounter", nowIso: now },
    paramsForChar(char, child.grade),
  );
  await saveProgress(userId, childId, next);
  return { progress: next, nextArrival: nextArrivalFrom(next, now, jaArrivalT) };
}

export async function runCompleteUnderstand(
  userId: string,
  childId: string,
  char: string,
  clock: Clock = systemClock,
) {
  await assertChildCanRideForCaller(userId, childId);
  const { child, map } = await loadProgress(userId, childId);
  const now = clock.now().toISOString();
  const next = evaluateProgress(
    map.get(char) ?? emptyProgress(char),
    { type: "completeUnderstand", nowIso: now },
    paramsForChar(char, child.grade),
  );
  await saveProgress(userId, childId, next);
  return { progress: next, nextArrival: nextArrivalFrom(next, now, jaArrivalT) };
}

export type SubmitPracticeInput = {
  childId: string;
  char: string;
  itemId: string;
  choiceId: string;
  isEcho: boolean;
  echoBatchDone: boolean;
  sessionId: string;
};

export async function runSubmitPractice(
  userId: string,
  data: SubmitPracticeInput,
  clock: Clock = systemClock,
) {
  // Commerce spec §3.1/§13 rule 4: entitlement is evaluated server-side,
  // not just as a client-side hint. This is one of four gated entry
  // points (getKanjiStudy/completeEncounter/completeUnderstand are the
  // other three) -- see assertChildCanRide's own comment for why there's
  // one shared throw site instead of four copies of the same check, and
  // why ownership is asked before entitlement.
  await assertChildCanRideForCaller(userId, data.childId);

  const item = getItem(data.itemId, true);
  if (!item || item.kanji !== data.char) throw new Error("unknown item");
  const graded = gradeChoice(item, data.choiceId);

  const { child, map } = await loadProgress(userId, data.childId);

  const now = clock.now().toISOString();
  const p = paramsForChar(data.char, child.grade);
  const prev = map.get(data.char) ?? emptyProgress(data.char);
  // P0-1: scoring authority is stored `almost` + `echoDueAt` compared to
  // this server-generated `now`, never the client's isEcho/echoBatchDone --
  // see progress-eval.ts's own note. Injecting where `now` comes from does
  // not touch who supplies it.
  const scoringEcho = echoIsDue(prev, now);
  const next = evaluateProgress(
    prev,
    {
      type: "answer",
      kind: item.kind,
      correct: graded.correct,
      isEcho: scoringEcho,
      echoBatchDone: scoringEcho,
      nowIso: now,
      shapeAvailable: shapeSurfaceAvailable(data.char),
      surfaceId: item.surfaceId ?? item.payload.surface?.id ?? `${item.kanji}:solo`,
      gentle: Boolean(item.payload.confusable || item.payload.phoneticFamily || item.payload.cloze),
    },
    p,
  );
  await saveProgress(userId, data.childId, next);
  await awardStamp(userId, data.childId, prev, next);
  await maybeRecordInspection({
    userId,
    childId: data.childId,
    kanji: data.char,
    prev,
    next,
    nowIso: now,
  });

  const sql: Sql = await getSql();
  await sql`
    insert into practice_events (
      user_id, child_id, kanji, kind, correct, prompt, answer, item_id, is_echo, session_id
    )
    values (
      ${userId}, ${data.childId}, ${data.char}, ${item.kind}, ${graded.correct},
      ${item.payload.prompt}, ${graded.label}, ${data.itemId}, ${scoringEcho}, ${data.sessionId}
    )
  `;

  return {
    correct: graded.correct,
    label: graded.label,
    progress: next,
    nextArrival: nextArrivalFrom(next, now, jaArrivalT),
    gradePerfect: buildGradeRings({
      progress: (() => {
        const nextMap = new Map(map);
        nextMap.set(data.char, next);
        return nextMap;
      })(),
      profileGrade: child.grade,
    }).find((r) => r.grade === (getKanji(data.char)?.grade ?? child.grade))?.perfect ?? 0,
  };
}
