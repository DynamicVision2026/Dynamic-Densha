import { PHONETIC_FAMILIES, type FamilyOutcome, type PhoneticFamily, type PhoneticMember } from "../data/phonetic-families.ts";
import { getKanji } from "../data/kyoiku.ts";
import { isElementaryReading } from "./readings.ts";
import type { Quiz } from "./quiz.ts";

export const PHONETIC_FAMILY_VARIANT = 91;
export const FAMILY_HIT_ID = "__family_hit__";
export const FAMILY_SHIFT_ID = "__family_shift__";
export const FAMILY_MISS_ID = "__family_miss__";

export const FAMILY_READINGS: readonly string[] = [
  ...new Set(PHONETIC_FAMILIES.flatMap((f) => f.reading_chips)),
];

export type FamilyQuizMeta = {
  familyId: string;
  phonetic: string;
  phoneticReading: string;
  house: string;
  house_ja: string;
  composed: string;
  expected_reading: string;
  outcome: FamilyOutcome;
};

export function familyById(id: string): PhoneticFamily | null {
  return PHONETIC_FAMILIES.find((f) => f.id === id) ?? null;
}

export function familyFor(kanji: string): PhoneticFamily | null {
  return (
    PHONETIC_FAMILIES.find(
      (f) => f.phonetic.kanji === kanji || f.members.some((m) => m.kanji === kanji),
    ) ?? null
  );
}

export function memberFor(kanji: string): { family: PhoneticFamily; member: PhoneticMember } | null {
  for (const family of PHONETIC_FAMILIES) {
    const member = family.members.find((m) => m.kanji === kanji);
    if (member) return { family, member };
  }
  return null;
}

export function isPhoneticStone(kanji: string): boolean {
  return PHONETIC_FAMILIES.some((f) => f.phonetic.kanji === kanji);
}

export function familyPlayable(family: PhoneticFamily, childGrade: number): boolean {
  if (family.phonetic.grade <= childGrade) return true;
  return family.members.some((m) => m.grade <= childGrade);
}

/** Reading chips: family bet plus nearby 音. Correctness is elementary_readings. */
export function chipsForFamily(family: PhoneticFamily): string[] {
  return family.reading_chips;
}

export function readingChipsFor(kanji: string, expected: string): Array<{ id: string; label: string; correct: boolean }> {
  const family = familyFor(kanji);
  const labels = family ? chipsForFamily(family) : [...FAMILY_READINGS].slice(0, 3);
  return labels.map((label) => ({
    id: `fam-read-${label}`,
    label,
    correct: isElementaryReading(kanji, label) && label === expected,
  }));
}

export function classifyFamilyChoice(
  member: PhoneticMember,
  chosen: string,
): "hit" | "shift" | "miss" {
  if (isElementaryReading(member.kanji, chosen) && chosen === member.expected_reading) {
    return "hit";
  }
  if (member.outcome === "shift" && chosen === "セイ") return "shift";
  const family = familyFor(member.kanji);
  if (family && chosen === family.phonetic.reading && member.expected_reading !== chosen) {
    return "shift";
  }
  return "miss";
}

export function choiceIdForClass(kind: "hit" | "shift" | "miss"): string {
  if (kind === "hit") return FAMILY_HIT_ID;
  if (kind === "shift") return FAMILY_SHIFT_ID;
  return FAMILY_MISS_ID;
}

export function buildFamilyQuiz(kanji: string): Quiz | null {
  const found = memberFor(kanji);
  const stone = PHONETIC_FAMILIES.find((f) => f.phonetic.kanji === kanji);
  const k = getKanji(kanji);
  if (!k) return null;

  if (found) {
    const { family, member } = found;
    if (!isElementaryReading(member.kanji, member.expected_reading)) return null;
    const chips = readingChipsFor(member.kanji, member.expected_reading);
    return {
      kind: "reading",
      prompt: `${member.meaning_part}の家に、${family.phonetic.kanji}を置く`,
      hint: "音の石",
      glyph: member.kanji,
      imagery: k.imagery,
      choices: chips.map((c) => ({ id: c.id, label: c.label, correct: c.correct })),
      phoneticFamily: {
        familyId: family.id,
        phonetic: family.phonetic.kanji,
        phoneticReading: family.phonetic.reading,
        house: member.meaning_part,
        house_ja: member.house_ja,
        composed: member.kanji,
        expected_reading: member.expected_reading,
        outcome: member.outcome,
      },
    };
  }

  if (stone) {
    if (!isElementaryReading(stone.phonetic.kanji, stone.phonetic.reading)) return null;
    const chips = readingChipsFor(stone.phonetic.kanji, stone.phonetic.reading);
    return {
      kind: "reading",
      prompt: `音の石「${stone.phonetic.kanji}」の音は？`,
      hint: "音の石",
      glyph: stone.phonetic.kanji,
      imagery: k.imagery,
      choices: chips.map((c) => ({ id: c.id, label: c.label, correct: c.correct })),
      phoneticFamily: {
        familyId: stone.id,
        phonetic: stone.phonetic.kanji,
        phoneticReading: stone.phonetic.reading,
        house: stone.phonetic.kanji,
        house_ja: "音の石",
        composed: stone.phonetic.kanji,
        expected_reading: stone.phonetic.reading,
        outcome: "hit",
      },
    };
  }

  return null;
}

export function gradeFamilyChoice(meta: FamilyQuizMeta, choiceId: string, chosenLabel?: string): {
  correct: boolean;
  label: string;
  kind: "hit" | "shift" | "miss";
} {
  if (choiceId === FAMILY_HIT_ID) {
    return { correct: true, label: meta.expected_reading, kind: "hit" };
  }
  if (choiceId === FAMILY_SHIFT_ID) {
    return { correct: false, label: meta.expected_reading, kind: "shift" };
  }
  if (choiceId === FAMILY_MISS_ID) {
    return { correct: false, label: meta.expected_reading, kind: "miss" };
  }
  const label = chosenLabel ?? "";
  const ok = isElementaryReading(meta.composed, label) && label === meta.expected_reading;
  if (ok) return { correct: true, label: meta.expected_reading, kind: "hit" };
  if (label === meta.phoneticReading && label !== meta.expected_reading) {
    return { correct: false, label: meta.expected_reading, kind: "shift" };
  }
  return { correct: false, label: meta.expected_reading, kind: "miss" };
}
