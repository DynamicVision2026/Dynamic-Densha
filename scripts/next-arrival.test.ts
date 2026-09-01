import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { echoArrivalWhen, jaArrivalT, ymdInZone } from "../src/lib/echo-arrival.ts";
import { getGradeParams } from "../src/lib/grade-params.ts";
import {
  emptyProgress,
  evaluateProgress,
  nextArrivalFrom,
  type ProgressState,
} from "../src/lib/progress-eval.ts";
import type { MessageKey } from "../src/lib/i18n/messages.ts";

const NOW = "2026-08-24T01:26:00.000Z"; // 10:26 JST Monday
const G1 = getGradeParams(1);

const LABELS: Record<string, string> = {
  echoArrivalToday: "きょう",
  echoArrivalTomorrow: "あした",
  echoArrivalDayAfter: "あさって",
  echoArrivalInDays: "{n}日後",
};

function t(key: MessageKey, vars?: Record<string, string | number>) {
  const raw = LABELS[key] ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));
}

function almost(dueIso: string): ProgressState {
  return {
    ...emptyProgress("右"),
    status: "almost",
    echoDueAt: dueIso,
    encounterCompleted: true,
    understandCompleted: true,
    lights: { reading: true, meaning: true, shape: true },
  };
}

test("almost + due tomorrow → あした, days 1, Tokyo Y-M-D", () => {
  const due = "2026-08-25T01:00:00.000Z";
  const arrival = nextArrivalFrom(almost(due), NOW, t);
  assert.ok(arrival);
  assert.equal(arrival.label, "あした");
  assert.equal(arrival.days, 1);
  assert.equal(arrival.dueLocalDate, ymdInZone(due));
  assert.equal(arrival.dueLocalDate, "2026-08-25");
  assert.equal(arrival.dueIso, due);
  assert.doesNotMatch(arrival.label, /遅れ|overdue|late/i);
});

test("almost + due same Tokyo day or past → きょう, days 0", () => {
  const same = nextArrivalFrom(almost("2026-08-24T06:00:00.000Z"), NOW, t);
  assert.equal(same?.label, "きょう");
  assert.equal(same?.days, 0);
  const past = nextArrivalFrom(almost("2026-08-23T15:00:00.000Z"), NOW, t);
  assert.equal(past?.label, "きょう");
  assert.equal(past?.days, 0);
  assert.doesNotMatch(past?.label ?? "", /遅れ|overdue|late/i);
});

test("new or fix → nextArrival null", () => {
  assert.equal(nextArrivalFrom(emptyProgress("円"), NOW, t), null);
  const fix: ProgressState = { ...emptyProgress("円"), status: "fix" };
  assert.equal(nextArrivalFrom(fix, NOW, t), null);
  const perfect: ProgressState = { ...emptyProgress("円"), status: "perfect" };
  assert.equal(nextArrivalFrom(perfect, NOW, t), null);
});

test("demo applyEvent and nextArrivalFrom share the same label", () => {
  const due = "2026-08-25T01:00:00.000Z";
  const state = almost(due);
  const demoSrc = readFileSync("src/lib/demo-progress.ts", "utf8");
  const serverSrc = readFileSync("src/lib/server/progress.ts", "utf8");
  assert.match(demoSrc, /export function applyEvent/);
  assert.match(demoSrc, /nextArrivalFrom\(next, nowIso, t\)/);
  assert.match(serverSrc, /nextArrival: nextArrivalFrom\(next, now, jaArrivalT\)/);
  const evaluated = evaluateProgress(state, { type: "open", nowIso: NOW }, G1);
  const fromEval = nextArrivalFrom(evaluated, NOW, t);
  const direct = nextArrivalFrom(state, NOW, t);
  assert.equal(fromEval?.label, direct?.label);
  assert.equal(direct?.label, echoArrivalWhen(due, NOW, t));
  assert.equal(direct?.label, "あした");
  assert.equal(jaArrivalT("echoArrivalTomorrow"), "あした");
});
