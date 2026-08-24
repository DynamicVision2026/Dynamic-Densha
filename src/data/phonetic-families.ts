export type FamilyOutcome = "hit" | "shift" | "outlier";

export type PhoneticMember = {
  kanji: string;
  /** Meaning-house shown to the child (radical or part). */
  meaning_part: string;
  house_ja: string;
  expected_reading: string;
  outcome: FamilyOutcome;
  grade: number;
};

export type PhoneticFamily = {
  id: string;
  label_ja: string;
  why: string;
  phonetic: { kanji: string; reading: string; grade: number };
  /** Reading chips shown in the workshop (elementary onyomi only). */
  reading_chips: string[];
  members: PhoneticMember[];
};

/**
 * 音の家族 pilots.
 * 請 is not 教育漢字 — omitted from 青.
 * 情 keeps 青 as phonetic but reads ジョウ (半分当たり).
 */
export const PHONETIC_FAMILIES: PhoneticFamily[] = [
  {
    id: "sei_ao",
    label_ja: "セイの家族",
    why: "青という音の石を、水・日・争・心の家に置くと、清・晴・静・情になる。",
    phonetic: { kanji: "青", reading: "セイ", grade: 1 },
    reading_chips: ["セイ", "ショウ", "ジョウ"],
    members: [
      {
        kanji: "晴",
        meaning_part: "日",
        house_ja: "ひの家",
        expected_reading: "セイ",
        outcome: "hit",
        grade: 2,
      },
      {
        kanji: "清",
        meaning_part: "氵",
        house_ja: "みずの家",
        expected_reading: "セイ",
        outcome: "hit",
        grade: 4,
      },
      {
        kanji: "静",
        meaning_part: "争",
        house_ja: "あらそいの家",
        expected_reading: "セイ",
        outcome: "hit",
        grade: 4,
      },
      {
        kanji: "情",
        meaning_part: "忄",
        house_ja: "こころの家",
        expected_reading: "ジョウ",
        outcome: "shift",
        grade: 5,
      },
    ],
  },
  {
    id: "kou_kou",
    label_ja: "コウの家族",
    why: "工という音の石を、力・糸・穴の家に置くと、功・紅・空になる。",
    phonetic: { kanji: "工", reading: "コウ", grade: 2 },
    reading_chips: ["コウ", "クウ", "オウ"],
    members: [
      {
        kanji: "功",
        meaning_part: "力",
        house_ja: "ちからの家",
        expected_reading: "コウ",
        outcome: "hit",
        grade: 4,
      },
      {
        kanji: "紅",
        meaning_part: "糸",
        house_ja: "いとの家",
        expected_reading: "コウ",
        outcome: "hit",
        grade: 6,
      },
      {
        kanji: "空",
        meaning_part: "穴",
        house_ja: "あなの家",
        expected_reading: "クウ",
        outcome: "shift",
        grade: 1,
      },
    ],
  },
  {
    id: "shu_shu",
    label_ja: "シュの家族",
    why: "主という音の石を、人・水・木の家に置くと、住・注・柱になる。音はシュからチュウ・ジュウへずれる。",
    phonetic: { kanji: "主", reading: "シュ", grade: 3 },
    reading_chips: ["シュ", "チュウ", "ジュウ"],
    members: [
      {
        kanji: "住",
        meaning_part: "亻",
        house_ja: "ひとの家",
        expected_reading: "ジュウ",
        outcome: "shift",
        grade: 3,
      },
      {
        kanji: "注",
        meaning_part: "氵",
        house_ja: "みずの家",
        expected_reading: "チュウ",
        outcome: "shift",
        grade: 3,
      },
      {
        kanji: "柱",
        meaning_part: "木",
        house_ja: "きの家",
        expected_reading: "チュウ",
        outcome: "shift",
        grade: 3,
      },
    ],
  },
];
