import assert from "node:assert/strict";
import { test } from "node:test";
import { GRADE_COUNTS, KYOIKU, TRAINS, getKanji, trainsForGrade } from "../src/data/kyoiku.ts";
import { MEANING_JA_OVERLAY } from "../src/data/kyoiku-meaning-ja.ts";
import { resolveActiveGrade } from "../src/lib/active-grade.ts";
import {
  coerceGrade,
  parseGrade,
  searchKyoiku,
  TRAIN_COUNTS,
} from "../src/lib/grade-nav.ts";
import { mapLinesFor } from "../src/lib/lines.ts";
import { isTeachReady, teachReadyChars } from "../src/lib/teach-ready.ts";
import { decorateTrains } from "../src/lib/trains.ts";

test("canonical grade param is 1–6 only", () => {
  assert.equal(parseGrade("3"), 3);
  assert.equal(parseGrade(2), 2);
  assert.equal(parseGrade("9"), undefined);
  assert.equal(parseGrade("foo"), undefined);
  assert.equal(parseGrade('"1"'), 1);
  assert.equal(parseGrade("'5'"), 5);
  assert.equal(coerceGrade(undefined, 1), 1);
  assert.equal(coerceGrade("5", 1), 5);
});

test("G2–G6 trains are listed without finishing G1", () => {
  assert.deepEqual(TRAIN_COUNTS, { 1: 16, 2: 32, 3: 40, 4: 41, 5: 39, 6: 38 });
  assert.deepEqual(GRADE_COUNTS, { 1: 80, 2: 160, 3: 200, 4: 202, 5: 193, 6: 191 });
  assert.deepEqual(trainsForGrade(2)[0]?.chars, ["引", "羽", "雲", "園", "遠"]);
  assert.ok(trainsForGrade(3).some((t) => t.chars.includes("漢")));
  assert.ok(trainsForGrade(2).some((t) => t.chars.includes("星")));
  assert.ok(trainsForGrade(2).some((t) => t.chars.includes("海")));
  assert.equal(TRAINS.reduce((n, t) => n + t.chars.length, 0), 1026);
  assert.equal(trainsForGrade(2).reduce((n, t) => n + t.chars.length, 0), 160);
});

test("all trains in a grade are open; jump does not wait on previous cars", () => {
  const empty = new Map();
  const g2 = decorateTrains(2, empty);
  assert.equal(g2.length, 32);
  assert.ok(g2.every((t) => t.unlocked));
  assert.ok(g2.some((t) => t.chars.includes("星")));
  const g5 = decorateTrains(5, empty);
  assert.ok(g5.every((t) => t.unlocked));
});

test("activeGrade URL wins over profile; else profile; else 1", () => {
  assert.equal(resolveActiveGrade({ urlGrade: 5, profileGrade: 2 }), 5);
  assert.equal(resolveActiveGrade({ profileGrade: 6 }), 6);
  assert.equal(resolveActiveGrade({}), 1);
});

test("map and timetable share grade lens: G5 is not G1 data", () => {
  const g5open = mapLinesFor(5).flatMap((l) => l.stations).filter((s) => !s.unopened);
  const g1open = mapLinesFor(1).flatMap((l) => l.stations).filter((s) => !s.unopened);
  assert.ok(g1open.every((s) => s.grade === 1));
  assert.ok(g5open.every((s) => s.grade === 5));
});

test("English meaning stubs are gone; 漢/講/地/議 are Japanese", () => {
  const latin = KYOIKU.filter((k) => /[A-Za-z]/.test(k.meaningJa) || /[A-Za-z]/.test(k.imagery));
  assert.deepEqual(
    latin.map((k) => k.char),
    [],
    latin.map((k) => `${k.char}:${k.meaningJa}`).join(" "),
  );
  assert.equal(getKanji("王")?.meaningJa, "おうさま");
  assert.match(getKanji("漢")!.meaningJa, /漢字/);
  assert.match(getKanji("講")!.meaningJa, /こうぎ/);
  assert.match(getKanji("地")!.meaningJa, /じめん/);
  assert.match(getKanji("議")!.meaningJa, /はなしあう|ぎかい/);
  assert.equal(getKanji("漢")?.meaningJa, MEANING_JA_OVERLAY["漢"]?.meaningJa);
  assert.equal(Object.keys(MEANING_JA_OVERLAY).length, 147);
});

test("search finds 星/海/漢; 鬱 and 麒 are honest empty", () => {
  assert.equal(searchKyoiku("星")[0]?.char, "星");
  assert.equal(searchKyoiku("海")[0]?.char, "海");
  assert.equal(searchKyoiku("漢")[0]?.char, "漢");
  assert.equal(searchKyoiku("かん").some((k) => k.char === "漢"), true);
  assert.deepEqual(searchKyoiku("鬱"), []);
  assert.deepEqual(searchKyoiku("麒"), []);
  assert.equal(getKanji("鬱"), undefined);
  assert.equal(getKanji("麒"), undefined);
});

test("teach_ready stays 1026; parent denom is still per-grade", () => {
  assert.equal(KYOIKU.length, 1026);
  assert.equal(teachReadyChars(1).length, 80);
  assert.equal(KYOIKU.filter((k) => isTeachReady(k.char)).length, 1026);
});
