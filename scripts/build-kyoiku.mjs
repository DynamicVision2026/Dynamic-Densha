#!/usr/bin/env node
/**
 * Build src/data/kyoiku.ts from the official 教育漢字 list + kanjidic-style
 * readings. Run: node scripts/build-kyoiku.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const csv = readFileSync("/tmp/kanji-src/kyoiku.csv", "utf8")
  .replace(/^\uFEFF/, "")
  .trim()
  .split(/\r?\n/)
  .slice(1)
  .map((line) => {
    const [char, grade] = line.split(",");
    return { char: char.trim(), grade: Number(grade) };
  })
  .filter((r) => r.char && r.grade >= 1 && r.grade <= 6);

const dict = JSON.parse(readFileSync("/tmp/kanji-src/kanji.json", "utf8"));

const GRADE1_JA = {
  一: "かずの いち",
  右: "みぎがわ",
  雨: "あめが ふる",
  円: "まる。えん",
  王: "おうさま",
  音: "おと。おん",
  下: "した。さがる",
  火: "ひ。ほのお",
  花: "はな",
  貝: "かい",
  学: "まなぶ",
  気: "き。こころや くうき",
  九: "ここのつ",
  休: "やすむ",
  玉: "たま",
  金: "きん。おかね",
  空: "そら。から",
  月: "つき。つきよ",
  犬: "いぬ",
  見: "みる",
  五: "いつつ",
  口: "くち",
  校: "がっこう",
  左: "ひだりがわ",
  三: "みっつ",
  山: "やま",
  子: "こ。こども",
  四: "よっつ",
  糸: "いと",
  字: "もじ。かんじ",
  耳: "みみ",
  七: "ななつ",
  車: "くるま",
  手: "て",
  十: "とお",
  出: "でる。だす",
  女: "おんな",
  小: "ちいさい",
  上: "うえ。あがる",
  森: "もり",
  人: "ひと",
  水: "みず",
  正: "ただしい",
  生: "いきる。うまれる",
  青: "あおい",
  夕: "ゆうがた",
  石: "いし",
  赤: "あかい",
  千: "せん",
  川: "かわ",
  先: "さき。せんせい",
  早: "はやい",
  草: "くさ",
  足: "あし",
  村: "むら",
  大: "おおきい",
  男: "おとこ",
  竹: "たけ",
  中: "なか",
  虫: "むし",
  町: "まち",
  天: "てん。そら",
  田: "た。たんぼ",
  土: "つち",
  二: "ふたつ",
  日: "ひ。ひび",
  入: "はいる",
  年: "とし。ねん",
  白: "しろい",
  八: "やっつ",
  百: "ひゃく",
  文: "ぶん。もじ",
  木: "き",
  本: "ほん。もと",
  名: "なまえ",
  目: "め",
  立: "たつ",
  力: "ちから",
  林: "はやし",
  六: "むっつ",
};


function meaningJa(char, meanings, kun) {
  if (GRADE1_JA[char]) return GRADE1_JA[char];
  if (kun && kun[0]) return kun[0];
  const first = (meanings || []).filter(Boolean)[0] || "";
  return first || "（意味を調べよう）";
}

function hiraToKata(s) {
  return [...s]
    .map((ch) => {
      const c = ch.codePointAt(0);
      if (c >= 0x3041 && c <= 0x3096) return String.fromCodePoint(c + 0x60);
      return ch;
    })
    .join("");
}

function cleanKun(raw) {
  return raw
    .replace(/[-.]/g, "")
    .replace(/[A-Za-z0-9^!]/g, "")
    .trim();
}

function cleanOn(raw) {
  return hiraToKata(raw.replace(/[-.]/g, "").trim());
}

function imagery(char, meaning, grade) {
  const curated = {
    一: "一本の線が、はじまりを示す。",
    山: "峰が連なり、空へ向かう形。",
    川: "水が三つに分かれて流れる。",
    日: "まるい太陽が、世界を照らす。",
    月: "夜空に浮かぶ、欠けていく光。",
    火: "炎が立ちのぼる、あたたかさ。",
    水: "したたるしずくが、命を潤す。",
    木: "根と幹と枝。いのちの姿。",
    林: "木が並び、風が通る。",
    森: "木が重なり、深いしじま。",
    花: "草が開き、色を咲かせる。",
    空: "穴のあいた場所、どこまでも広い。",
    雨: "天から降る、うるおい。",
    春: "草が日を浴び、めざめる季節。",
    夏: "人が足を休め、暑い日を過ごす。",
    秋: "禾と火。実りを焼く季節。",
    冬: "冬ごもりの終わりが来る。",
    学: "子が屋根の下で、学びを受ける。",
    校: "木を交えて組む、学び舎。",
    人: "人が支え合って立つ姿。",
    心: "心臓の形。思いの中心。",
    海: "水が母のように広い。",
    雲: "雨を孕んだ、空のわた。",
  };
  if (curated[char]) return curated[char];
  return `${meaning}を、かたちにした字。`;
}

const entries = csv.map(({ char, grade }) => {
  const info = dict[char] || {};
  const on = (info.readings_on || []).map(cleanOn).filter(Boolean);
  const kun = (info.readings_kun || []).map(cleanKun).filter(Boolean);
  const meanings = info.meanings || info.wk_meanings || [];
  const ja = meaningJa(char, meanings, kun);
  return {
    char,
    grade,
    strokes: Number(info.strokes) || 0,
    on,
    kun,
    meaningJa: ja,
    imagery: imagery(char, ja, grade),
  };
});

if (entries.length !== 1026) {
  console.error("expected 1026, got", entries.length);
  process.exit(1);
}

const byGrade = [1, 2, 3, 4, 5, 6].map((g) => entries.filter((e) => e.grade === g).length);
console.log("by grade", byGrade, "total", entries.length);

function chunk(chars) {
  const groups = [];
  for (let i = 0; i < chars.length; i += 5) groups.push(chars.slice(i, i + 5));
  if (groups.length > 1 && groups[groups.length - 1].length <= 2) {
    const last = groups.pop();
    const prev = groups[groups.length - 1];
    if (prev.length + last.length <= 6) {
      prev.push(...last);
    } else {
      groups.push(last);
    }
  }
  return groups;
}

const trains = [];
for (const grade of [1, 2, 3, 4, 5, 6]) {
  const chars = entries.filter((e) => e.grade === grade).map((e) => e.char);
  const groups = chunk(chars);
  groups.forEach((cars, idx) => {
    const first = entries.find((e) => e.char === cars[0]);
    const kun = first?.kun?.[0];
    const dest = kun ? `${kun}のえき` : `${cars[0]}のえき`;
    trains.push({
      id: `g${grade}-t${String(idx + 1).padStart(2, "0")}`,
      grade,
      index: idx + 1,
      dest,
      chars: cars,
    });
  });
}

console.log("trains", trains.length, "avg", (1026 / trains.length).toFixed(2));

mkdirSync("/workspace/src/data", { recursive: true });

const ts = `/* Official 文部科学省 学年別漢字配当表 (1026 教育漢字). Generated. */
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

writeFileSync("/workspace/src/data/kyoiku.ts", ts);
console.log("wrote src/data/kyoiku.ts", ts.length);
