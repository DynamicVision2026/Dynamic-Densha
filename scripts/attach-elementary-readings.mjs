#!/usr/bin/env node
/**
 * Attach Spec v0.2 Part C `elementaryReadings` onto every kyōiku record.
 * Source: 音訓の小・中・高等学校段階別割り振り表（平成29年3月）小学校 column.
 * Rebuild: node scripts/attach-elementary-readings.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";

const MARK = /[①②③④⑤⑥⑦⑧⑨⑩○◎●]/g;

function parseReadings(cell) {
  if (!cell) return [];
  const seen = new Set();
  const out = [];
  for (const part of cell.split(MARK)) {
    const r = part.replace(/\s+/g, "").trim();
    if (!r || seen.has(r)) continue;
    seen.add(r);
    out.push(r);
  }
  return out;
}

function isKatakana(raw) {
  const ch = String(raw).trim()[0];
  if (!ch) return false;
  const c = ch.codePointAt(0) ?? 0;
  return c >= 0x30a1 && c <= 0x30f6;
}

function splitOnKun(readings) {
  const onyomi = [];
  const kunyomi = [];
  for (const r of readings) {
    if (isKatakana(r)) onyomi.push(r);
    else kunyomi.push(r);
  }
  return { onyomi, kunyomi };
}

/** 付表2-only characters: no standalone 小学校 音訓 in the main grid. */
const FUTHYO2 = {
  滋: { onyomi: [], kunyomi: ["しが"] },
  阪: { onyomi: [], kunyomi: ["さか"] },
};

const csv = readFileSync(new URL("../src/data/onkun-warihuri.csv", import.meta.url), "utf8").replace(
  /^\uFEFF/,
  "",
);
const official = new Map();
for (const line of csv.split(/\r?\n/)) {
  if (!line.trim()) continue;
  const [char, elementary] = line.split(",");
  if (!char) continue;
  official.set(char, parseReadings(elementary ?? ""));
}

const src = readFileSync(new URL("../src/data/kyoiku.ts", import.meta.url), "utf8");
const kyoikuStart = src.indexOf("export const KYOIKU: KyoikuKanji[] = ");
const trainsStart = src.indexOf("export const TRAINS: TrainDef[] = ");
const countsStart = src.indexOf("export const GRADE_COUNTS");
if (kyoikuStart < 0 || trainsStart < 0 || countsStart < 0) {
  throw new Error("unexpected kyoiku.ts shape");
}

const kyoikuAssign = src.indexOf("= [", kyoikuStart);
const trainsAssign = src.indexOf("= [", trainsStart);
if (kyoikuAssign < 0 || trainsAssign < 0 || countsStart < 0) {
  throw new Error("unexpected kyoiku.ts shape");
}

const kyoikuJson = src
  .slice(kyoikuAssign + 2, trainsStart)
  .replace(/;\s*$/, "")
  .trim();
const trainsJson = src
  .slice(trainsAssign + 2, countsStart)
  .replace(/;\s*$/, "")
  .trim();

const entries = JSON.parse(kyoikuJson);
const trains = JSON.parse(trainsJson);

let fromOfficial = 0;
let fromFutohyo = 0;
let empty = 0;
for (const k of entries) {
  delete k.elementaryReadings;
  delete k.elementary_readings;
  const list = official.get(k.char) ?? [];
  if (list.length) {
    k.elementaryReadings = splitOnKun(list);
    fromOfficial += 1;
  } else if (FUTHYO2[k.char]) {
    k.elementaryReadings = FUTHYO2[k.char];
    fromFutohyo += 1;
  } else {
    k.elementaryReadings = { onyomi: [], kunyomi: [] };
    empty += 1;
  }
}

const ts = `/* Official 文部科学省 学年別漢字配当表 (1026 教育漢字). Generated.
 * elementaryReadings: 音訓の小・中・高等学校段階別割り振り表（平成29年3月）小学校 column.
 * Rebuild field: node scripts/attach-elementary-readings.mjs
 */
export type Grade = 1 | 2 | 3 | 4 | 5 | 6;

/** Spec v0.2 Part C — 小学校 ○ 音・訓. Empty arrays are allowed. */
export type ElementaryReadings = {
  onyomi: string[];
  kunyomi: string[];
};

export type KyoikuKanji = {
  char: string;
  grade: Grade;
  strokes: number;
  on: string[];
  kun: string[];
  meaningJa: string;
  imagery: string;
  elementaryReadings: ElementaryReadings;
};

export type TrainDef = {
  id: string;
  grade: Grade;
  index: number;
  dest: string;
  chars: string[];
};

export const KYOIKU: KyoikuKanji[] = ${JSON.stringify(entries)};

export const TRAINS: TrainDef[] = ${JSON.stringify(trains)};

export const GRADE_COUNTS: Record<Grade, number> = {
  1: 80,
  2: 160,
  3: 200,
  4: 202,
  5: 193,
  6: 191,
};

const byChar = new Map(KYOIKU.map((k) => [k.char, k]));

export function getKanji(char: string): KyoikuKanji | undefined {
  return byChar.get(char);
}

export function trainsForGrade(grade: Grade): TrainDef[] {
  return TRAINS.filter((t) => t.grade === grade);
}

export function trainById(id: string): TrainDef | undefined {
  return TRAINS.find((t) => t.id === id);
}

export function trainForChar(char: string): TrainDef | undefined {
  return TRAINS.find((t) => t.chars.includes(char));
}
`;

writeFileSync(new URL("../src/data/kyoiku.ts", import.meta.url), ts);
console.log("wrote src/data/kyoiku.ts", {
  total: entries.length,
  fromOfficial,
  fromFutohyo,
  empty,
  bytes: ts.length,
});
