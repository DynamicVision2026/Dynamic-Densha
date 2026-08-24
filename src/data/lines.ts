export type LineType = "semantic" | "phonetic";

export type LineStation = {
  kanji: string;
  grade: number;
};

export type KanjiLine = {
  id: string;
  type: LineType;
  label_ja: string;
  /** Editorial reason. Not auto-derived from components or readings. */
  why: string;
  stations: LineStation[];
};

/**
 * Curated lines only. Do not auto-add a character because it contains 木
 * or shares an onyomi — 校 is the canonical counterexample.
 *
 * U12: denser network. Each new station has a one-line editorial why
 * in the line `why` field (not "contains radical").
 */
export const KANJI_LINES: KanjiLine[] = [
  {
    id: "line_ki",
    type: "semantic",
    label_ja: "木の線",
    why: "木が並んで林、さらに森。校は木偏でも学校の字なので入れない。",
    stations: [
      { kanji: "木", grade: 1 },
      { kanji: "林", grade: 1 },
      { kanji: "森", grade: 1 },
    ],
  },
  {
    id: "line_sei",
    type: "phonetic",
    label_ja: "せいの線",
    why: "音セイで結ぶ。青は色の意味へ残し、ここは生→星→清。",
    stations: [
      { kanji: "生", grade: 1 },
      { kanji: "星", grade: 2 },
      { kanji: "清", grade: 4 },
    ],
  },
  {
    id: "line_te",
    type: "semantic",
    label_ja: "手の線",
    why: "手の左右。石は形が近いが手ではないので入れない。",
    stations: [
      { kanji: "手", grade: 1 },
      { kanji: "右", grade: 1 },
      { kanji: "左", grade: 1 },
    ],
  },
  {
    id: "line_hi",
    type: "semantic",
    label_ja: "日の線",
    why: "日がついて明るく、晴れ、春へ。時は寺の音なので入れない。",
    stations: [
      { kanji: "日", grade: 1 },
      { kanji: "明", grade: 2 },
      { kanji: "晴", grade: 2 },
      { kanji: "春", grade: 2 },
    ],
  },
  {
    id: "line_mizu",
    type: "semantic",
    label_ja: "みずの線",
    why: "水が川になり池をたたえ海、さらに湖へ。雨は天からの字、洋は羊の音なので入れない。",
    stations: [
      { kanji: "水", grade: 1 },
      { kanji: "川", grade: 1 },
      { kanji: "池", grade: 2 },
      { kanji: "海", grade: 2 },
      { kanji: "湖", grade: 3 },
    ],
  },
  {
    id: "line_hito",
    type: "semantic",
    label_ja: "人の線",
    why: "人が木により休む。体は人のからだ。何・作は別の話なので入れない。",
    stations: [
      { kanji: "人", grade: 1 },
      { kanji: "休", grade: 1 },
      { kanji: "体", grade: 2 },
    ],
  },
  {
    id: "line_yama",
    type: "semantic",
    label_ja: "山の線",
    why: "山の岩、海に浮かぶ島。岳は別配当なので入れない。",
    stations: [
      { kanji: "山", grade: 1 },
      { kanji: "岩", grade: 2 },
      { kanji: "島", grade: 3 },
    ],
  },
  {
    id: "line_kuchi",
    type: "semantic",
    label_ja: "口の線",
    why: "口から言葉が出て話になる。古は「ふるい」の字なので入れない。",
    stations: [
      { kanji: "口", grade: 1 },
      { kanji: "言", grade: 2 },
      { kanji: "話", grade: 2 },
    ],
  },
  {
    id: "line_tsuchi",
    type: "semantic",
    label_ja: "土の線",
    why: "土が地になり場がひらく。寺は土偏でも祈りの字なので入れない。",
    stations: [
      { kanji: "土", grade: 1 },
      { kanji: "地", grade: 2 },
      { kanji: "場", grade: 2 },
    ],
  },
  {
    id: "line_ka",
    type: "semantic",
    label_ja: "火の線",
    why: "火が炭になり灰へ。秋は火があっても季節の字なので入れない。",
    stations: [
      { kanji: "火", grade: 1 },
      { kanji: "炭", grade: 3 },
      { kanji: "灰", grade: 6 },
    ],
  },
  {
    id: "line_chu",
    type: "phonetic",
    label_ja: "ちゅうの線",
    why: "音チュウで結ぶ。中は「なか」の意味へ残し、ここは昼→忠。虫はむしの字、沖は海の話なので入れない。",
    stations: [
      { kanji: "中", grade: 1 },
      { kanji: "昼", grade: 2 },
      { kanji: "忠", grade: 6 },
    ],
  },
];
