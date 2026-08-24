import { publishedComponentAssembly, publishedStrokeAssembly } from "../data/shape-catalog.ts";
import { getKanji, KYOIKU } from "../data/kyoiku.ts";
import type { EchoSurface } from "./echo-surfaces.ts";
import {
  COMPONENT_COMPLETE_ID,
  COMPONENT_SKIP_ID,
  type ComponentAssembly,
} from "./component-assembly.ts";
import { shapeModeFor } from "./kanji-structure.ts";
import { meaningDistractors, meaningQuizFor } from "./meaning-bank.ts";
import type { PracticeKind } from "./mastery.ts";
import {
  elementaryReadings,
  foldReading,
  isElementaryReading,
  primaryElementaryReading,
} from "./readings.ts";
import type { ShapeStrokeVariant } from "./shape.ts";
import {
  STROKE_COMPLETE_ID,
  STROKE_SKIP_ID,
  type StrokeAssembly,
} from "./stroke-assembly.ts";

export type QuizChoice = {
  id: string;
  label: string;
  correct: boolean;
  shapeVariant?: ShapeStrokeVariant;
};

export type Quiz = {
  kind: PracticeKind;
  prompt: string;
  hint: string;
  glyph: string;
  imagery: string;
  choices: QuizChoice[];
  strokeAssembly?: StrokeAssembly;
  componentAssembly?: ComponentAssembly;
  surface?: EchoSurface;
  confusable?: { target: string; decoy: string; prompt_ja: string };
  cloze?: {
    frame_ja: string;
    answer: string;
    primary_light: "shape" | "meaning";
    gentle?: boolean;
  };
  phoneticFamily?: {
    familyId: string;
    phonetic: string;
    phoneticReading: string;
    house: string;
    house_ja: string;
    composed: string;
    expected_reading: string;
    outcome: "hit" | "shift" | "outlier";
  };
};

function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick<T>(items: T[], seed: string, n: number, exclude: T[] = []): T[] {
  const ban = new Set(exclude);
  const pool = items.filter((x) => !ban.has(x));
  const out: T[] = [];
  let h = hash(seed);
  const copy = [...pool];
  while (out.length < n && copy.length) {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    const i = h % copy.length;
    out.push(copy.splice(i, 1)[0]!);
  }
  return out;
}

export function shuffle<T>(items: T[], seed: string): T[] {
  const a = [...items];
  let h = hash(seed);
  for (let i = a.length - 1; i > 0; i--) {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    const j = h % (i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function buildQuiz(
  char: string,
  kind: PracticeKind,
  seed: string,
  opts?: { surface?: EchoSurface | null; echo?: boolean },
): Quiz | null {
  const k = getKanji(char);
  if (!k) return null;
  const peers = KYOIKU.filter((x) => x.grade === k.grade && x.char !== k.char);
  const surface = opts?.surface ?? null;

  if (kind === "reading") {
    const correct = surface?.reading && isElementaryReading(k.char, surface.reading)
      ? surface.reading
      : primaryElementaryReading(k.char);
    if (!correct) return null;
    const own = new Set(elementaryReadings(k.char).map(foldReading));
    const distractors = pick(
      peers
        .map((p) => primaryElementaryReading(p.char))
        .filter((r): r is string => {
          if (!r) return false;
          if (own.has(foldReading(r))) return false;
          return !isElementaryReading(k.char, r);
        }),
      seed + "r",
      3,
    );
    const labels = Array.from(new Set([correct, ...distractors])).slice(0, 4);
    while (labels.length < 4) labels.push(correct);
    const choices = shuffle(
      labels.map((label, i) => ({
        id: `r${i}-${label}`,
        label,
        correct: foldReading(label) === foldReading(correct) && isElementaryReading(k.char, label),
      })),
      seed + "rs",
    );
    const on = elementaryReadings(k.char).filter((r) => /[ァ-ヶ]/.test(r));
    const kun = elementaryReadings(k.char).filter((r) => !/[ァ-ヶ]/.test(r));
    return {
      kind,
      prompt: surface && surface.text !== k.char ? `この「${k.char}」の よみは？` : "この字の よみは？",
      hint: on[0] && kun[0] ? `音 ${on[0]} ／ 訓 ${kun[0]}` : "小学校のよみ",
      glyph: k.char,
      imagery: k.imagery,
      choices,
      surface: surface ?? undefined,
    };
  }

  if (kind === "meaning") {
    const fallback = surface?.meaningJa || k.meaningJa;
    const editorial = meaningQuizFor(k.char, fallback);
    const correct = editorial.correct;
    const distractors =
      editorial.decoys ?? meaningDistractors(k.char, correct, seed + "m", 3);
    const labels = Array.from(new Set([correct, ...distractors])).slice(0, 4);
    while (labels.length < 4) {
      const extra = peers.map((p) => p.meaningJa).find((m) => m && !labels.includes(m));
      if (!extra) break;
      labels.push(extra);
    }
    const choices = shuffle(
      labels.map((label, i) => ({
        id: `m${i}`,
        label,
        correct: label === correct,
      })),
      seed + "ms",
    );
    return {
      kind,
      prompt: surface && surface.text !== k.char ? "このことばの いみは？" : "この字の いみは？",
      hint: "ことばの心",
      glyph: k.char,
      imagery: k.imagery,
      choices,
      surface: surface ?? undefined,
    };
  }

  const mode = shapeModeFor(k.char);
  if (mode === "component") {
    const assembly = publishedComponentAssembly(k.char);
    if (assembly) {
      return {
        kind,
        prompt: "パーツを、正しい位置に置く",
        hint: "合体の つくり",
        glyph: k.char,
        imagery: k.imagery,
        componentAssembly: assembly,
        choices: [
          { id: COMPONENT_COMPLETE_ID, label: k.char, correct: true, shapeVariant: "canonical" },
          { id: COMPONENT_SKIP_ID, label: "", correct: false, shapeVariant: "canonical" },
        ],
      };
    }
  }
  if (mode === "stroke") {
    const assembly = publishedStrokeAssembly(k.char);
    if (assembly) {
      return {
        kind,
        prompt: "画を、正しい順に置く",
        hint: "つぎの画だけが、はまる",
        glyph: k.char,
        imagery: k.imagery,
        strokeAssembly: assembly,
        choices: [
          { id: STROKE_COMPLETE_ID, label: k.char, correct: true, shapeVariant: "canonical" },
          { id: STROKE_SKIP_ID, label: "", correct: false, shapeVariant: "canonical" },
        ],
      };
    }
  }

  return null;
}
