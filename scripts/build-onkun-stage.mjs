#!/usr/bin/env node
/**
 * Build src/data/onkun-stage.ts from 音訓の小・中・高等学校段階別割り振り表（平成29年3月）.
 * Source CSV: src/data/onkun-warihuri.csv (tomari.org transcription of the MEXT table).
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

const csv = readFileSync(new URL("../src/data/onkun-warihuri.csv", import.meta.url), "utf8")
  .replace(/^\uFEFF/, "");

const map = {};
for (const line of csv.split(/\r?\n/)) {
  if (!line.trim()) continue;
  const [char, elementary, juniorHigh, highSchool] = line.split(",");
  if (!char) continue;
  map[char] = {
    elementary: parseReadings(elementary ?? ""),
    juniorHigh: parseReadings(juniorHigh ?? ""),
    highSchool: parseReadings(highSchool ?? ""),
  };
}

const ts = `/* Generated from 音訓の小・中・高等学校段階別割り振り表（平成29年3月）.
 * Rebuild: node scripts/build-onkun-stage.mjs
 */
export type StageReadings = {
  elementary: string[];
  juniorHigh: string[];
  highSchool: string[];
};

export const ONKUN_STAGE: Record<string, StageReadings> = ${JSON.stringify(map)};

export function stageReadingsOf(char: string): StageReadings | undefined {
  return ONKUN_STAGE[char];
}
`;

writeFileSync(new URL("../src/data/onkun-stage.ts", import.meta.url), ts);
console.log("wrote src/data/onkun-stage.ts", Object.keys(map).length, "kanji");
