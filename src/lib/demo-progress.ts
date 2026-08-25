import { trainsForGrade, getKanji, type Grade } from "@/data/kyoiku";
import type { MasteryStatus, PracticeKind } from "@/lib/mastery";
import { decorateTrains } from "@/lib/trains";
import { getGradeParams } from "@/lib/grade-params";
import {
  echoAvailable,
  echoIsDue,
  emptyProgress,
  evaluateProgress,
  hydrateProgress,
  requiredLights,
  suggestBeat,
  utcDay,
  type BeatId,
  type ProgressState,
} from "@/lib/progress-eval";
import {
  drawPublishedItems,
  getItem,
  getPhoneticFamilyItem,
  gradeChoice,
  shapeSurfaceAvailable,
  type BankItem,
} from "@/lib/items";
import { justReachedPerfect, mergeStamp, stampFromPerfect, type Stamp } from "@/lib/stamps";
import { mapLinesFor } from "@/lib/lines";
import { buildParentReport } from "@/lib/parent-report";
import { pickWeekPeek } from "@/lib/week-peek";
import { isInspectionDue } from "@/lib/inspection";
import { buildGradeRings } from "@/lib/train-overview";
import {
  demoBoardAndForward,
  demoProfileGrade,
  recordDemoInspection,
  readDemoInspections,
  setDemoStartBand as setBand,
  confirmDemoRollover,
  dismissDemoRollover,
} from "@/lib/demo-route";
import type { StartBand } from "@/lib/grade-route";

const KEY = "densha.demo.progress.v3";
const EVENT_KEY = "densha.demo.events.v2";
const ECHO_KEY = "densha.demo.echo-starts.v2";
const STAMP_KEY = "densha.demo.stamps.v1";

export const DEMO_CHILD = {
  id: "demo",
  name: "そら",
  get grade(): Grade {
    return demoProfileGrade();
  },
};

/** Preview-only: second-echo-due so 到着 can show the green couple beat. Not 王/右 (auto-demo). */
export const DEMO_COUPLE_CHAR = "花";

/** Extra greens so Welcome shows a short moving train (一 + these = 4). */
const DEMO_CONSIST_CHARS = ["音", "下", "火"] as const;

export type DemoEvent = {
  kanji: string;
  kind: PracticeKind;
  correct: boolean;
  answer: string;
  created_at: string;
  item_id: string;
  is_echo: boolean;
  session_id: string;
};

function params() {
  return getGradeParams(DEMO_CHILD.grade);
}

function paramsFor(char: string) {
  return getGradeParams(getKanji(char)?.grade ?? DEMO_CHILD.grade);
}

function isoHoursFromNow(h: number) {
  return new Date(Date.now() + h * 3600_000).toISOString();
}

function seedMap(): Record<string, ProgressState> {
  const first = trainsForGrade(1)[0];
  const chars = first?.chars ?? ["一", "右", "雨", "円", "王"];
  const now = new Date().toISOString();
  const out: Record<string, ProgressState> = {};

  const base = (char: string, patch: Partial<ProgressState>): ProgressState => ({
    ...emptyProgress(char),
    encounterCompleted: true,
    understandCompleted: true,
    seenAt: isoHoursFromNow(-48),
    lastPracticeAt: isoHoursFromNow(-2),
    ...patch,
  });

  out[chars[0] ?? "一"] = base(chars[0] ?? "一", {
    status: "perfect",
    lights: { reading: true, meaning: true, shape: true },
    perfectAt: isoHoursFromNow(-24),
    almostAt: isoHoursFromNow(-48),
    echoSuccessCount: 2,
  });
  out[chars[1] ?? "右"] = base(chars[1] ?? "右", {
    status: "almost",
    lights: { reading: true, meaning: true, shape: true },
    almostAt: isoHoursFromNow(-30),
    echoDueAt: isoHoursFromNow(-1),
    echoSuccessCount: 0,
    surfacesSeenSuccess: ["右:solo"],
    lastSuccessByKind: { reading: "右:solo", meaning: "右:solo", shape: "右:solo" },
  });
  out[chars[2] ?? "雨"] = base(chars[2] ?? "雨", {
    status: "almost",
    lights: { reading: true, meaning: true, shape: true },
    almostAt: now,
    echoDueAt: isoHoursFromNow(20),
  });
  out[chars[3] ?? "円"] = base(chars[3] ?? "円", {
    status: "fix",
    lights: { reading: true, meaning: false, shape: false },
    repairRequiredKinds: ["meaning"],
    wrongCountByKind: { reading: 0, meaning: 1, shape: 0 },
  });
  for (const char of DEMO_CONSIST_CHARS) {
    out[char] = base(char, {
      status: "perfect",
      lights: { reading: true, meaning: true, shape: true },
      perfectAt: isoHoursFromNow(-36),
      almostAt: isoHoursFromNow(-60),
      echoSuccessCount: 2,
    });
  }
  out[DEMO_COUPLE_CHAR] = base(DEMO_COUPLE_CHAR, {
    status: "almost",
    lights: { reading: true, meaning: true, shape: true },
    almostAt: isoHoursFromNow(-200),
    echoDueAt: isoHoursFromNow(-1),
    echoSuccessCount: 1,
    surfacesSeenSuccess: [`${DEMO_COUPLE_CHAR}:solo`],
    lastSuccessByKind: {
      reading: `${DEMO_COUPLE_CHAR}:solo`,
      meaning: `${DEMO_COUPLE_CHAR}:solo`,
      shape: `${DEMO_COUPLE_CHAR}:solo`,
    },
  });
  return out;
}

function migrateDemo(all: Record<string, ProgressState>): {
  all: Record<string, ProgressState>;
  changed: boolean;
} {
  let changed = false;
  const next = { ...all };
  const seeded = seedMap();
  for (const char of DEMO_CONSIST_CHARS) {
    if (!next[char]) {
      next[char] = seeded[char]!;
      changed = true;
    }
  }
  const couple = next[DEMO_COUPLE_CHAR];
  if (!couple) {
    next[DEMO_COUPLE_CHAR] = seeded[DEMO_COUPLE_CHAR]!;
    changed = true;
  }
  return { all: next, changed };
}

function readAll(): Record<string, ProgressState> {
  if (typeof window === "undefined") return seedMap();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) {
      const seeded = seedMap();
      window.localStorage.setItem(KEY, JSON.stringify(seeded));
      return seeded;
    }
    const parsed = JSON.parse(raw) as Record<string, ProgressState>;
    const { all, changed } = migrateDemo(parsed);
    if (changed) writeAll(all);
    return all;
  } catch {
    return seedMap();
  }
}

function writeAll(all: Record<string, ProgressState>) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

function seedStamps(): Stamp[] {
  const one = readAll()["一"] ?? seedMap()["一"];
  if (!one || (one.status !== "perfect" && !one.perfectAt)) return [];
  return [stampFromPerfect(one)];
}

function readStamps(): Stamp[] {
  if (typeof window === "undefined") return seedStamps();
  try {
    const raw = window.localStorage.getItem(STAMP_KEY);
    if (!raw) {
      const fromPerfect = Object.values(readAll())
        .filter((row) => row.status === "perfect" || row.perfectAt)
        .reduce<Stamp[]>((acc, row) => mergeStamp(acc, stampFromPerfect(row)), []);
      const seeded = fromPerfect.length ? fromPerfect : seedStamps();
      window.localStorage.setItem(STAMP_KEY, JSON.stringify(seeded));
      return seeded;
    }
    return JSON.parse(raw) as Stamp[];
  } catch {
    return seedStamps();
  }
}

function writeStamps(stamps: Stamp[]) {
  try {
    window.localStorage.setItem(STAMP_KEY, JSON.stringify(stamps));
  } catch {
    /* ignore */
  }
}

function awardIfPerfect(prev: ProgressState | undefined, next: ProgressState) {
  if (!justReachedPerfect(prev, next)) return;
  writeStamps(mergeStamp(readStamps(), stampFromPerfect(next)));
}

function seedEvents(): DemoEvent[] {
  const now = Date.now();
  return [
    {
      kanji: "一",
      kind: "reading",
      correct: true,
      answer: "ひと",
      created_at: new Date(now - 3600_000).toISOString(),
      item_id: "一:reading:0",
      is_echo: false,
      session_id: "seed",
    },
    {
      kanji: "雨",
      kind: "shape",
      correct: false,
      answer: "雪",
      created_at: new Date(now - 1800_000).toISOString(),
      item_id: "雨:shape:0",
      is_echo: false,
      session_id: "seed",
    },
    {
      kanji: "円",
      kind: "meaning",
      correct: false,
      answer: "かね",
      created_at: new Date(now - 600_000).toISOString(),
      item_id: "円:meaning:0",
      is_echo: false,
      session_id: "seed",
    },
  ];
}

function readEvents(): DemoEvent[] {
  if (typeof window === "undefined") return seedEvents();
  try {
    const raw = window.localStorage.getItem(EVENT_KEY);
    if (!raw) {
      const seeded = seedEvents();
      window.localStorage.setItem(EVENT_KEY, JSON.stringify(seeded));
      return seeded;
    }
    return JSON.parse(raw) as DemoEvent[];
  } catch {
    return seedEvents();
  }
}

function writeEvents(events: DemoEvent[]) {
  try {
    window.localStorage.setItem(EVENT_KEY, JSON.stringify(events.slice(0, 40)));
  } catch {
    /* ignore */
  }
}

function readEchoStarts(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(ECHO_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function writeEchoStarts(starts: string[]) {
  try {
    window.localStorage.setItem(ECHO_KEY, JSON.stringify(starts.slice(0, 40)));
  } catch {
    /* ignore */
  }
}

export function echoesStartedToday(nowIso = new Date().toISOString()): number {
  const day = utcDay(nowIso);
  return readEchoStarts().filter((s) => utcDay(s) === day).length;
}

export function recordEchoStart(nowIso = new Date().toISOString()) {
  const starts = readEchoStarts();
  starts.push(nowIso);
  writeEchoStarts(starts);
}

function persist(char: string, next: ProgressState) {
  const all = readAll();
  const prev = all[char];
  all[char] = next;
  writeAll(all);
  awardIfPerfect(prev, next);
  return next;
}

export function getDemoStudy(char: string): ProgressState {
  return hydrateProgress(readAll()[char] ?? emptyProgress(char));
}

export function openDemoKanji(char: string): ProgressState {
  const now = new Date().toISOString();
  const next = evaluateProgress(getDemoStudy(char), { type: "open", nowIso: now }, paramsFor(char));
  return persist(char, next);
}

export function completeDemoEncounter(char: string): ProgressState {
  const now = new Date().toISOString();
  const next = evaluateProgress(
    getDemoStudy(char),
    { type: "completeEncounter", nowIso: now },
    paramsFor(char),
  );
  return persist(char, next);
}

export function completeDemoUnderstand(char: string): ProgressState {
  const now = new Date().toISOString();
  const next = evaluateProgress(
    getDemoStudy(char),
    { type: "completeUnderstand", nowIso: now },
    paramsFor(char),
  );
  return persist(char, next);
}

export function demoBeat(char: string): BeatId {
  const now = new Date().toISOString();
  return suggestBeat(
    getDemoStudy(char),
    paramsFor(char),
    shapeSurfaceAvailable(char),
    now,
    echoesStartedToday(now),
  );
}

export function demoEchoOn(char: string): boolean {
  const now = new Date().toISOString();
  return echoAvailable(getDemoStudy(char), now, echoesStartedToday(now), paramsFor(char));
}

export function drawDemoItems(char: string, mode: "session" | "echo"): BankItem[] {
  const p = paramsFor(char);
  const shape = shapeSurfaceAvailable(char);
  const kinds = requiredLights(p, shape);
  const progress = getDemoStudy(char);
  const sessionKinds =
    mode === "echo"
      ? kinds
      : kinds.filter((k) => !progress.lights[k] || progress.repairRequiredKinds.includes(k));
  return drawPublishedItems({
    kanji: char,
    kinds: sessionKinds.length ? sessionKinds : kinds,
    seed: `${DEMO_CHILD.id}|${char}|${mode}|0`,
    maxPerKind: p.max_items_per_kind_per_session,
    maxTotal: mode === "echo" ? kinds.length * p.echo_items_per_light : p.max_items_per_session,
    echo: mode === "echo" ? { lastSuccessByKind: progress.lastSuccessByKind, seenIds: progress.surfacesSeenSuccess } : undefined,
  });
}

export function submitDemoAnswer(input: {
  char: string;
  itemId: string;
  choiceId: string;
  isEcho: boolean;
  echoBatchDone: boolean;
  sessionId: string;
}): { correct: boolean; label: string; progress: ProgressState; gradePerfect?: number } {
  const item = getItem(input.itemId, true);
  if (!item || item.kanji !== input.char) {
    throw new Error("unknown item");
  }
  const graded = gradeChoice(item, input.choiceId);
  const now = new Date().toISOString();
  const prev = getDemoStudy(input.char);
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
      shapeAvailable: shapeSurfaceAvailable(input.char),
      surfaceId: item.surfaceId ?? item.payload.surface?.id ?? `${item.kanji}:solo`,
      gentle: Boolean(item.payload.confusable || item.payload.phoneticFamily || item.payload.cloze),
    },
    paramsFor(input.char),
  );
  persist(input.char, next);
  if (
    prev.status === "perfect" &&
    next.status === "perfect" &&
    isInspectionDue(prev, readDemoInspections()[input.char], now)
  ) {
    recordDemoInspection(input.char, now);
  }
  const events = readEvents();
  events.unshift({
    kanji: input.char,
    kind: item.kind,
    correct: graded.correct,
    answer: graded.label,
    created_at: now,
    item_id: input.itemId,
    is_echo: scoringEcho,
    session_id: input.sessionId,
  });
  writeEvents(events);
  const rings = buildGradeRings({ progress: readAll(), profileGrade: DEMO_CHILD.grade });
  const g = (getKanji(input.char)?.grade ?? DEMO_CHILD.grade) as Grade;
  const gradePerfect = rings.find((r) => r.grade === g)?.perfect ?? 0;
  return { correct: graded.correct, label: graded.label, progress: next, gradePerfect };
}

/** Workshop: UI-only 当たり / 半分当たり. Never writes mastery. */
export function applyDemoWorkshop(kanji: string, choiceId: string) {
  const item = getPhoneticFamilyItem(kanji);
  if (!item) return null;
  return gradeChoice(item, choiceId);
}

export function getDemoHome(viewGrade: Grade = DEMO_CHILD.grade) {
  const now = new Date().toISOString();
  const p = params();
  const map = new Map(Object.values(readAll()).map((row) => [row.kanji, row]));
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
  const rings = buildGradeRings({ progress: map, profileGrade: DEMO_CHILD.grade });
  const echoQueue = [...map.values()]
    .filter((row) => echoAvailable(row, now, 0, p))
    .slice(0, Math.max(0, p.echo_per_day_cap - echoesStartedToday(now)));
  const seenToday = [...map.values()].filter(
    (row) => row.seenAt && utcDay(row.seenAt) === utcDay(now),
  ).length;
  return {
    child: DEMO_CHILD,
    viewGrade,
    trains,
    total,
    perfect,
    echoQueue,
    seenToday,
    maxNew: p.max_new_per_day,
    peek: pickWeekPeek({ progress: map, grade: viewGrade }),
    board: demoBoardAndForward({ progress: map, events: readEvents(), nowIso: now }).board,
    rings,
  };
}

export function listDemoEchoQueue() {
  return getDemoHome().echoQueue;
}

export function listDemoEvents(): DemoEvent[] {
  return readEvents();
}

export function listDemoMistakes(): DemoEvent[] {
  return readEvents().filter((e) => !e.correct);
}

export function listDemoStamps(): Stamp[] {
  return readStamps();
}

export function getDemoMap(viewGrade: Grade = DEMO_CHILD.grade) {
  const now = new Date().toISOString();
  const map = new Map(Object.values(readAll()).map((row) => [row.kanji, row]));
  const lines = mapLinesFor(viewGrade).map((view) => ({
    ...view,
    stations: view.stations.map((station) => ({
      ...station,
      status: map.get(station.kanji)?.status ?? "new",
      echoDue: echoIsDue(map.get(station.kanji) ?? emptyProgress(station.kanji), now),
      echoDueAt: (map.get(station.kanji) ?? emptyProgress(station.kanji)).echoDueAt,
    })),
  }));
  return { child: DEMO_CHILD, viewGrade, lines, progress: map };
}

export function getDemoOverview() {
  const home = getDemoHome();
  const stamps = readStamps();
  const progressMap = new Map(Object.entries(readAll()));
  const report = buildParentReport({
    grade: DEMO_CHILD.grade,
    progress: progressMap,
    events: readEvents(),
    stamps,
  });
  const lines = report.lines.map((line) => ({
    id: line.id,
    label: line.label,
    type: line.type,
    done: line.perfect,
    total: line.total,
  }));
  const extra = demoBoardAndForward({
    progress: progressMap,
    events: readEvents(),
  });
  return {
    child: DEMO_CHILD,
    trains: home.trains,
    counts: report.counts,
    recent: readEvents(),
    started: Object.keys(readAll()).length,
    total: home.total,
    perfect: home.perfect,
    stamps,
    stampCount: stamps.length,
    lines,
    report,
    route: extra.route,
    plan: extra.plan,
    forward: extra.forward,
    progress: progressMap,
    history: extra.history,
    arrival: extra.arrival,
    canRollover: extra.canRollover,
    aprilPrompt: extra.aprilPrompt,
  };
}

export function setDemoStartBand(band: StartBand) {
  const progressMap = new Map(Object.entries(readAll()));
  return setBand(band, progressMap);
}

export function setDemoRollover() {
  const progressMap = new Map(Object.entries(readAll()));
  return confirmDemoRollover(progressMap);
}

export function setDemoRolloverDismiss() {
  dismissDemoRollover();
}

/** Reset 王 (new) and 右 (echo-due) so the in-app auto-demo can replay cleanly. */
export function prepareDemoTour() {
  const all = readAll();
  all["王"] = emptyProgress("王");
  all["右"] = {
    ...emptyProgress("右"),
    encounterCompleted: true,
    understandCompleted: true,
    seenAt: isoHoursFromNow(-48),
    lastPracticeAt: isoHoursFromNow(-2),
    status: "almost",
    lights: { reading: true, meaning: true, shape: true },
    almostAt: isoHoursFromNow(-30),
    echoDueAt: isoHoursFromNow(-1),
    echoSuccessCount: 0,
    surfacesSeenSuccess: ["右:solo"],
    lastSuccessByKind: { reading: "右:solo", meaning: "右:solo", shape: "右:solo" },
  };
  writeAll(all);
  writeEchoStarts([]);
}
