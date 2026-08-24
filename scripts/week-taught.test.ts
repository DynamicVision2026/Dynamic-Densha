import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { emptyProgress } from "../src/lib/progress-eval.ts";
import { buildParentReport } from "../src/lib/parent-report.ts";
import { taughtThisWeek } from "../src/lib/week-taught.ts";
import { pickWeekPeek } from "../src/lib/week-peek.ts";
import { mapSearchFrom, workshopSearchFrom } from "../src/lib/grade-nav.ts";

const NOW = "2026-08-24T02:00:00.000Z";

test("T5 empty week does not invent rides", () => {
  const rows = taughtThisWeek([], NOW);
  assert.deepEqual(rows, []);
  const report = buildParentReport({
    grade: 1,
    progress: {},
    events: [],
    stamps: [],
    nowIso: NOW,
  });
  assert.deepEqual(report.taught, []);
});

test("T5 events outside the week are ignored", () => {
  const rows = taughtThisWeek(
    [
      {
        kanji: "林",
        kind: "shape",
        correct: true,
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ],
    NOW,
  );
  assert.deepEqual(rows, []);
});

test("T5 seed-like rides become concrete teaching lines", () => {
  const rows = taughtThisWeek(
    [
      {
        kanji: "円",
        kind: "meaning",
        correct: false,
        created_at: "2026-08-24T01:50:00.000Z",
      },
      {
        kanji: "雨",
        kind: "shape",
        correct: false,
        created_at: "2026-08-24T01:30:00.000Z",
      },
      {
        kanji: "一",
        kind: "reading",
        correct: true,
        created_at: "2026-08-24T01:00:00.000Z",
      },
      {
        kanji: "林",
        kind: "shape",
        correct: true,
        created_at: "2026-08-24T01:55:00.000Z",
      },
    ],
    NOW,
  );
  assert.equal(rows[0]?.kanji, "林");
  assert.equal(rows[0]?.word, "森林");
  assert.equal(rows[0]?.structure, "木と木で 林");
  assert.equal(rows[0]?.lineLabel, "木の線");
  assert.ok(rows.some((r) => r.kanji === "一" && r.word === "一人"));
  assert.ok(rows.some((r) => r.kanji === "雨"));
  assert.equal(rows.length, 4);
});

test("T5 unique kanji, most recent first, max 6", () => {
  const events = Array.from({ length: 8 }, (_, i) => ({
    kanji: ["一", "右", "雨", "円", "王", "山", "川", "木"][i]!,
    kind: "reading" as const,
    correct: true,
    created_at: new Date(Date.parse(NOW) - i * 1000).toISOString(),
  }));
  events.push({
    kanji: "一",
    kind: "meaning",
    correct: true,
    created_at: new Date(Date.parse(NOW) - 500).toISOString(),
  });
  const rows = taughtThisWeek(events, NOW);
  assert.equal(rows.length, 6);
  assert.equal(rows[0]?.kanji, "一");
  assert.equal(rows.filter((r) => r.kanji === "一").length, 1);
});

test("T6 peek prefers a line the child has boarded (右 → 手の線)", () => {
  const peek = pickWeekPeek({
    grade: 1,
    progress: {
      右: {
        ...emptyProgress("右"),
        status: "almost",
        lastPracticeAt: "2026-08-24T01:00:00.000Z",
      },
    },
  });
  assert.equal(peek?.kind, "line");
  assert.equal(peek?.id, "line_te");
  assert.equal(peek?.label, "手の線");
  assert.equal(peek?.kanji, "右");
});

test("T6 peek falls back to 音の家族 when no editorial line", () => {
  const peek = pickWeekPeek({
    grade: 1,
    progress: {
      青: {
        ...emptyProgress("青"),
        status: "almost",
        lastPracticeAt: "2026-08-24T01:00:00.000Z",
      },
    },
  });
  assert.equal(peek?.kind, "family");
  assert.equal(peek?.id, "sei_ao");
  assert.equal(peek?.label, "セイの家族");
});

test("T6 empty progress still offers one curriculum peek, not invented mastery", () => {
  const peek = pickWeekPeek({ grade: 1, progress: {} });
  assert.equal(peek?.kind, "line");
  assert.equal(peek?.id, "line_ki");
  assert.equal(peek?.label, "木の線");
});

test("T6 peek is a single card and does not call evaluateProgress", () => {
  const peekSrc = readFileSync(new URL("../src/lib/week-peek.ts", import.meta.url), "utf8");
  const taughtSrc = readFileSync(new URL("../src/lib/week-taught.ts", import.meta.url), "utf8");
  const parentSrc = readFileSync(new URL("../src/lib/parent-report.ts", import.meta.url), "utf8");
  assert.equal(/\bevaluateProgress\s*\(/.test(peekSrc), false);
  assert.equal(/\bevaluateProgress\s*\(/.test(taughtSrc), false);
  assert.equal(/\bevaluateProgress\s*\(/.test(parentSrc), false);
});

test("T6 map/workshop search keep grade and a single target", () => {
  assert.deepEqual(mapSearchFrom({ grade: "2", line: "line_te" }), { grade: 2, line: "line_te" });
  assert.deepEqual(mapSearchFrom({ line: "not-a-line" }), {});
  assert.deepEqual(workshopSearchFrom({ grade: 1, family: "sei_ao" }), {
    grade: 1,
    family: "sei_ao",
  });
  assert.deepEqual(workshopSearchFrom({ family: "../evil" }), {});
});
