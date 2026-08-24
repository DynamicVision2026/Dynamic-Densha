/**
 * Meaning-item distractors: near-meaning / near-word, not random noise.
 */
import { getKanji, KYOIKU } from "../data/kyoiku.ts";
import { decoyFor } from "./confusable.ts";
import { preferredMeaningSurface } from "./echo-surfaces.ts";

const NEAR: Record<string, string[]> = {
  右: ["左", "石"],
  左: ["右", "石"],
  大: ["小", "犬"],
  犬: ["大"],
  上: ["下", "中"],
  下: ["上", "中"],
  入: ["出", "人"],
  出: ["入", "人"],
  人: ["入", "大"],
  日: ["月", "目"],
  目: ["日", "耳"],
  木: ["本", "林"],
  本: ["木", "末"],
  林: ["森", "木"],
  森: ["林", "木"],
  山: ["川", "石"],
  川: ["山", "水"],
  水: ["火", "川"],
  火: ["水", "花"],
  花: ["草", "木"],
  草: ["花", "早"],
  早: ["草", "日"],
  白: ["百", "赤"],
  百: ["白", "千"],
  赤: ["青", "白"],
  青: ["赤", "白"],
  男: ["女", "子"],
  女: ["男", "子"],
  見: ["貝", "目"],
  貝: ["見", "目"],
  土: ["士", "王"],
  王: ["玉", "正"],
  玉: ["王", "石"],
  力: ["刀", "男"],
  千: ["干", "十"],
  十: ["千", "一"],
  小: ["大", "中"],
  中: ["上", "下"],
  手: ["足", "口"],
  足: ["手", "口"],
  口: ["目", "耳"],
  耳: ["目", "口"],
  学: ["字", "校"],
  字: ["学", "子"],
  校: ["学", "木"],
  生: ["青", "先"],
  先: ["生", "秋"],
  月: ["日", "夕"],
  夕: ["月", "日"],
  雨: ["水", "川"],
  空: ["天", "日"],
  天: ["空", "気"],
  気: ["天", "空"],
  車: ["出", "入"],
  石: ["右", "玉"],
};

/** Editorial いみ: semantic gloss + semantic decoys. Not competing readings. */
const MEANING_QUIZ: Record<string, { correct: string; decoys: string[] }> = {
  王: { correct: "おうさまの こども", decoys: ["まちの 名前", "どうぶつの 名前", "たべものの 名前"] },
  山: { correct: "たかい ところ。やま", decoys: ["みずが ながれる ところ", "もえる もの", "かずの なまえ"] },
  川: { correct: "みずが ながれる ところ", decoys: ["たかい やま", "もえる ほのお", "ひとの なまえ"] },
  木: { correct: "き。はやしの もと", decoys: ["みずの なまえ", "ひとの かぞく", "たべもの"] },
  人: { correct: "ひと。だれか", decoys: ["やまの なまえ", "どうぶつ", "かず"] },
  日: { correct: "ひが でる こと", decoys: ["よるの つき", "みずの なまえ", "たべもの"] },
  月: { correct: "よるに でる つき", decoys: ["ひるの たいよう", "かわの みず", "たべもの"] },
  火: { correct: "もえる ほのお", decoys: ["つめたい みず", "やまの なまえ", "かず"] },
  水: { correct: "のむ みず。ながれる もの", decoys: ["もえる ほのお", "たかい やま", "ひと"] },
  右: { correct: "みぎがわの て", decoys: ["ひだりがわの て", "いしの なまえ", "たべもの"] },
  左: { correct: "ひだりがわの て", decoys: ["みぎがわの て", "いしの なまえ", "どうぶつ"] },
  学: { correct: "まなぶ ところ", decoys: ["たべもの", "どうぶつ", "かずの なまえ"] },
  大: { correct: "おおきい こと", decoys: ["ちいさい こと", "どうぶつ", "みず"] },
  小: { correct: "ちいさい こと", decoys: ["おおきい こと", "やま", "ひ"] },
  中: { correct: "まんなか。なか", decoys: ["うえ", "した", "たべもの"] },
};

export function meaningQuizFor(
  char: string,
  fallback: string,
): { correct: string; decoys?: string[] } {
  const row = MEANING_QUIZ[char];
  if (row) return row;
  return { correct: fallback };
}

function glossOf(char: string): string | null {
  const quiz = MEANING_QUIZ[char];
  if (quiz) return quiz.correct;
  const s = preferredMeaningSurface(char);
  const g = s?.meaningJa?.trim() || getKanji(char)?.meaningJa?.trim();
  return g || null;
}

function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function meaningDistractors(char: string, correct: string, seed: string, n = 3): string[] {
  const editorial = MEANING_QUIZ[char];
  if (editorial) return editorial.decoys.slice(0, n);

  const seen = new Set([correct]);
  const out: string[] = [];
  const push = (label: string | null | undefined) => {
    const t = label?.trim();
    if (!t || seen.has(t) || out.length >= n) return;
    seen.add(t);
    out.push(t);
  };

  for (const near of NEAR[char] ?? []) push(glossOf(near));
  const pair = decoyFor(char);
  if (pair) push(glossOf(pair));

  const k = getKanji(char);
  const grade = k?.grade ?? 1;
  const peers = KYOIKU.filter((x) => x.grade === grade && x.char !== char);
  let h = hash(seed);
  const copy = [...peers];
  while (out.length < n && copy.length) {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    const i = h % copy.length;
    const p = copy.splice(i, 1)[0]!;
    push(glossOf(p.char) ?? p.meaningJa);
  }
  return out.slice(0, n);
}
