import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { emptyProgress, type ProgressState } from "../src/lib/progress-eval.ts";
import { stationLines, stationSituation } from "../src/lib/station-state.ts";
import { MESSAGES } from "../src/lib/i18n/messages.ts";

const NOW = "2026-01-01T00:00:00.000Z";

function almost(overrides: Partial<ProgressState> = {}): ProgressState {
  return { ...emptyProgress("一"), status: "almost", ...overrides };
}

test("reached blue: first echo window, not yet due", () => {
  const s = almost({ echoSuccessCount: 0, echoDueAt: "2026-01-02T00:00:00.000Z" });
  assert.equal(stationSituation(s, NOW), "reachedBlue");
  const lines = stationLines("reachedBlue", "あした");
  assert.equal(lines.line1, "stationReachedBlueLine1");
  assert.equal(lines.line2, "stationReachedBlueLine2");
  assert.deepEqual(lines.line2Vars, { when: "あした" });
});

test("still blue: second echo window, not yet due -- ignores the real day count", () => {
  const s = almost({ echoSuccessCount: 1, echoDueAt: "2026-01-08T00:00:00.000Z" });
  assert.equal(stationSituation(s, NOW), "stillBlue");
  const lines = stationLines("stillBlue", "7日後");
  assert.equal(lines.line2, "stationStillBlueLine2");
  // Deliberately no interpolation of the real day count -- see the module's
  // own comment. "7日後" (or any real count) must never leak through here.
  assert.equal(lines.line2Vars, undefined);
});

test("overdue: due regardless of echoSuccessCount, and regardless of how overdue", () => {
  for (const echoSuccessCount of [0, 1]) {
    for (const daysLate of [0, 1, 10, 40]) {
      const dueAt = new Date(Date.parse(NOW) - daysLate * 86_400_000).toISOString();
      const s = almost({ echoSuccessCount, echoDueAt: dueAt });
      assert.equal(stationSituation(s, NOW), "overdue", `echoSuccessCount=${echoSuccessCount} daysLate=${daysLate}`);
    }
  }
  const lines = stationLines("overdue", "きょう");
  assert.equal(lines.line1, null, "no first line for overdue -- table says '—'");
  assert.equal(lines.line2, "stationOverdueLine2");
});

test("reached green: perfect, regardless of echo history", () => {
  const s: ProgressState = { ...emptyProgress("一"), status: "perfect" };
  assert.equal(stationSituation(s, NOW), "reachedGreen");
  const lines = stationLines("reachedGreen", "きょう");
  assert.equal(lines.line1, "stationReachedGreenLine1");
  assert.equal(lines.line2, "stationReachedGreenLine2");
});

test("repair: fix or lost, both map to the same situation", () => {
  assert.equal(stationSituation({ ...emptyProgress("一"), status: "fix" }, NOW), "repair");
  assert.equal(stationSituation({ ...emptyProgress("一"), status: "lost" }, NOW), "repair");
  const lines = stationLines("repair", "きょう");
  assert.equal(lines.line1, "stationRepairLine1");
  assert.equal(lines.line2, "stationRepairLine2");
});

test("new: nothing to say -- not yet a station state", () => {
  assert.equal(stationSituation(emptyProgress("一"), NOW), null);
});

test("every station key exists in every locale, and none is finer than a day", () => {
  const keys = [
    "stationReachedBlueLine1",
    "stationReachedBlueLine2",
    "stationStillBlueLine1",
    "stationStillBlueLine2",
    "stationReachedGreenLine1",
    "stationReachedGreenLine2",
    "stationRepairLine1",
    "stationRepairLine2",
    "stationOverdueLine2",
  ] as const;
  const timeUnit = /時間|分|秒|hour|minute|second|小时|分钟|秒钟|分鐘|秒鐘/i;
  for (const locale of Object.keys(MESSAGES) as (keyof typeof MESSAGES)[]) {
    for (const key of keys) {
      const value = (MESSAGES[locale] as Record<string, string>)[key];
      assert.ok(value, `${locale}.${key} is missing`);
      assert.equal(timeUnit.test(value), false, `${locale}.${key} names a unit finer than a day: "${value}"`);
    }
  }
});

test("stillBlue's copy is fixed prose, not a template -- it must not contain a brace", () => {
  for (const locale of Object.keys(MESSAGES) as (keyof typeof MESSAGES)[]) {
    const value = (MESSAGES[locale] as Record<string, string>).stationStillBlueLine2;
    assert.equal(/\{.*\}/.test(value), false, `${locale}: stillBlue must be a fixed approximation, not interpolated`);
  }
});

test("the old single-line feedback keys are gone, not left dead", () => {
  const src = readFileSync("src/lib/i18n/messages.ts", "utf8");
  for (const dead of ["feedbackPerfect", "feedbackAlmost:", "feedbackAlmostEcho", "feedbackFix", "feedbackLost", "echoArrival:"]) {
    assert.equal(src.includes(dead), false, `${dead} should have been removed, not left unused`);
  }
});
