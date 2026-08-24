import { trainsForGrade, type Grade } from "../data/kyoiku.ts";
import { pairFor } from "./confusable.ts";
import { exampleWordSurfaces } from "./echo-surfaces.ts";
import { mapLinesFor } from "./lines.ts";
import { STATUSES, type MasteryStatus, type PracticeKind } from "./mastery.ts";
import { emptyProgress, type ProgressState } from "./progress-eval.ts";
import { isTeachReady } from "./teach-ready.ts";
import type { Stamp } from "./stamps.ts";
import { taughtThisWeek, type TaughtItem } from "./week-taught.ts";

export type ReportEvent = {
  kanji: string;
  kind: PracticeKind | string;
  correct: boolean;
  created_at: string;
  is_echo?: boolean;
  session_id?: string;
  answer?: string;
};

export type AttentionItem = {
  kanji: string;
  status: MasteryStatus;
  word?: string;
  reason: "lost" | "fix" | "almost" | "waiting_second" | "confusable";
  echoDueAt?: string | null;
};

export type WeekActivity = {
  sessionsStarted: number;
  sessionsCompleted: number;
  echoesCompleted: number;
  newAlmostOrPerfect: number;
};

export type ParentLineRow = {
  id: string;
  label: string;
  type: string;
  touched: number;
  perfect: number;
  total: number;
};

export type ParentReport = {
  grade: Grade;
  counts: Record<MasteryStatus, number>;
  timetableTotal: number;
  teachReadyTotal: number;
  teachReadyPerfect: number;
  week: WeekActivity;
  attention: AttentionItem[];
  paper: string[];
  stampCount: number;
  lines: ParentLineRow[];
  summary: { echo: number; fix: number };
  taught: TaughtItem[];
};

const WEEK_MS = 7 * 24 * 3600_000;
const ATTENTION_MAX = 8;
const PAPER_MAX = 5;

function wordFor(char: string): string | undefined {
  return exampleWordSurfaces(char)[0]?.text;
}

function inWeek(iso: string | null | undefined, since: number): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && t >= since;
}

export function buildParentReport(input: {
  grade: Grade;
  progress: Map<string, ProgressState> | Record<string, ProgressState>;
  events: ReportEvent[];
  stamps: Stamp[];
  nowIso?: string;
}): ParentReport {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const now = Date.parse(nowIso);
  const since = now - WEEK_MS;
  const map = input.progress instanceof Map ? input.progress : new Map(Object.entries(input.progress));
  const trains = trainsForGrade(input.grade);
  const cars = trains.flatMap((t) => t.chars);

  const counts: Record<MasteryStatus, number> = {
    new: 0,
    lost: 0,
    fix: 0,
    almost: 0,
    perfect: 0,
  };
  let teachReadyTotal = 0;
  let teachReadyPerfect = 0;
  for (const char of cars) {
    const row = map.get(char) ?? emptyProgress(char);
    counts[row.status] += 1;
    if (isTeachReady(char)) {
      teachReadyTotal += 1;
      if (row.status === "perfect") teachReadyPerfect += 1;
    }
  }

  const weekEvents = input.events.filter((e) => inWeek(e.created_at, since));
  const completed = new Set(
    weekEvents.filter((e) => e.correct && e.session_id).map((e) => e.session_id),
  );
  const echoSessions = new Set(
    weekEvents.filter((e) => e.is_echo && e.session_id).map((e) => e.session_id),
  );
  let newAlmostOrPerfect = 0;
  for (const char of cars) {
    const row = map.get(char);
    if (!row) continue;
    if (inWeek(row.almostAt, since) || inWeek(row.perfectAt, since)) newAlmostOrPerfect += 1;
  }

  const attention: AttentionItem[] = [];
  const lost = cars.filter((c) => (map.get(c) ?? emptyProgress(c)).status === "lost");
  const fix = cars.filter((c) => (map.get(c) ?? emptyProgress(c)).status === "fix");
  const almostSecond = cars
    .map((c) => map.get(c) ?? emptyProgress(c))
    .filter((r) => r.status === "almost" && (r.echoSuccessCount ?? 0) >= 1)
    .sort((a, b) => Date.parse(a.almostAt ?? "9999") - Date.parse(b.almostAt ?? "9999"));

  const push = (kanji: string, reason: AttentionItem["reason"]) => {
    if (attention.some((a) => a.kanji === kanji)) return;
    if (attention.length >= ATTENTION_MAX) return;
    const row = map.get(kanji) ?? emptyProgress(kanji);
    attention.push({
      kanji,
      status: row.status,
      word: wordFor(kanji),
      reason,
      echoDueAt: row.echoDueAt,
    });
  };
  for (const c of lost) push(c, "lost");
  for (const c of fix) push(c, "fix");
  for (const r of almostSecond) push(r.kanji, "waiting_second");

  const confuseFailed = weekEvents
    .filter((e) => !e.correct && e.kind === "shape" && pairFor(e.kanji))
    .map((e) => e.kanji);
  for (const c of confuseFailed) push(c, "confusable");

  const paper: string[] = [];
  for (const c of [...lost, ...fix]) {
    if (paper.length >= PAPER_MAX) break;
    if (!paper.includes(c)) paper.push(c);
  }
  const almostAny = cars
    .map((c) => map.get(c) ?? emptyProgress(c))
    .filter((r) => r.status === "almost")
    .sort((a, b) => Date.parse(a.almostAt ?? "9999") - Date.parse(b.almostAt ?? "9999"));
  for (const r of almostAny) {
    if (paper.length >= PAPER_MAX) break;
    if (!isTeachReady(r.kanji)) continue;
    if (!paper.includes(r.kanji)) paper.push(r.kanji);
  }

  const lines = mapLinesFor(input.grade).map((view) => ({
    id: view.line.id,
    label: view.line.label_ja,
    type: view.line.type,
    touched: view.line.stations.filter((s) => {
      const st = map.get(s.kanji)?.status;
      return Boolean(st && st !== "new");
    }).length,
    perfect: view.line.stations.filter((s) => map.get(s.kanji)?.status === "perfect").length,
    total: view.line.stations.length,
  }));

  return {
    grade: input.grade,
    counts,
    timetableTotal: cars.length,
    teachReadyTotal,
    teachReadyPerfect,
    week: {
      sessionsStarted: new Set(weekEvents.map((e) => e.session_id).filter(Boolean)).size || (weekEvents.length ? 1 : 0),
      sessionsCompleted: completed.size,
      echoesCompleted: echoSessions.size,
      newAlmostOrPerfect,
    },
    attention,
    paper,
    stampCount: input.stamps.length,
    lines,
    summary: { echo: echoSessions.size, fix: counts.fix },
    taught: taughtThisWeek(input.events, nowIso),
  };
}

export { STATUSES };
