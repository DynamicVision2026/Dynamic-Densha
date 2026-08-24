import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { getItem } from "../src/lib/items.ts";
import { preferredMeaningSurface, exampleWordSurfaces, isLegalEchoTransition } from "../src/lib/echo-surfaces.ts";
import { emptyProgress, type ProgressState } from "../src/lib/progress-eval.ts";
import { buildParentReport } from "../src/lib/parent-report.ts";
import { isTeachReady, teachReadyReport } from "../src/lib/teach-ready.ts";

test("F4 山 is teach_ready; empty readings cannot be", () => {
  const yama = teachReadyReport("山");
  assert.equal(yama.teach_ready, true);
  assert.deepEqual(yama.fails, []);
  assert.equal(isTeachReady("山"), true);
  assert.equal(isTeachReady("右"), true);
});

test("F4 missing word surface fails teach_ready", () => {
  const row = teachReadyReport("龍");
  assert.equal(row.checks.word_surface, false);
  assert.equal(row.teach_ready, false);
});

test("F2 meaning item prefers a word surface for 右", () => {
  const surface = preferredMeaningSurface("右");
  assert.ok(surface);
  assert.equal(surface.text, "右手");
  assert.equal(surface.reading, "みぎ");
  const item = getItem("右:meaning:0", true);
  assert.ok(item?.payload.surface);
  assert.equal(item.payload.surface.text, "右手");
  assert.equal(item.payload.surface.reading, "みぎ");
});

test("F2 再訪 右 stays みぎ, never ユウ", () => {
  assert.equal(isLegalEchoTransition("右", "右:右手", "右:右側"), true);
  assert.equal(isLegalEchoTransition("右", "右:右手", "右:左右"), false);
});

test("F1+F3 parent report is read-only and ordered", () => {
  const progress: Record<string, ProgressState> = {
    円: { ...emptyProgress("円"), status: "fix" },
    雨: { ...emptyProgress("雨"), status: "lost" },
    右: {
      ...emptyProgress("右"),
      status: "almost",
      almostAt: "2026-08-01T00:00:00.000Z",
      echoSuccessCount: 1,
    },
  };
  const report = buildParentReport({
    grade: 1,
    progress,
    events: [
      {
        kanji: "右",
        kind: "shape",
        correct: false,
        created_at: new Date().toISOString(),
        is_echo: false,
        session_id: "s1",
      },
    ],
    stamps: [],
    nowIso: new Date().toISOString(),
  });
  assert.ok(report.attention.length <= 8);
  assert.equal(report.attention[0]?.kanji, "雨");
  assert.equal(report.attention[0]?.reason, "lost");
  assert.ok(report.attention.some((a) => a.kanji === "円" && a.reason === "fix"));
  assert.ok(report.paper.length <= 5);
  assert.equal(report.paper[0], "雨");
  assert.ok(report.teachReadyTotal > 0);
  assert.ok(report.teachReadyTotal <= report.timetableTotal);
  assert.ok(report.attention.find((a) => a.kanji === "右")?.word === "右手");
});

test("F4 parent denominator is not 1026", () => {
  const report = buildParentReport({
    grade: 1,
    progress: {},
    events: [],
    stamps: [],
  });
  assert.ok(report.timetableTotal < 200);
  assert.ok(report.teachReadyTotal <= report.timetableTotal);
  assert.notEqual(report.teachReadyTotal, 1026);
});

test("framework does not call evaluateProgress from parent-report", () => {
  const src = readFileSync(new URL("../src/lib/parent-report.ts", import.meta.url), "utf8");
  assert.equal(/\bevaluateProgress\s*\(/.test(src), false);
});

test("example words exist for first-train QA chars", () => {
  for (const ch of ["一", "右", "雨", "円", "王", "山"]) {
    assert.ok(exampleWordSurfaces(ch).length >= 1, ch);
  }
});
