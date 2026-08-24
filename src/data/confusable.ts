export type ConfusablePair = {
  a: string;
  b: string;
  prompt_a: string;
  prompt_b: string;
};

/**
 * Editorial look-alike stations. Not generated from edit distance.
 * U16: ~15 pairs. Age-appropriate prompts. Never a fourth light.
 */
export const CONFUSABLE_PAIRS: ConfusablePair[] = [
  {
    a: "未",
    b: "末",
    prompt_a: "まだ の「未」はどれ？",
    prompt_b: "すえ の「末」はどれ？",
  },
  {
    a: "右",
    b: "石",
    prompt_a: "みぎ手の「右」はどれ？",
    prompt_b: "いし の「石」はどれ？",
  },
  {
    a: "土",
    b: "士",
    prompt_a: "つち の「土」はどれ？",
    prompt_b: "さむらい の「士」はどれ？",
  },
  {
    a: "大",
    b: "犬",
    prompt_a: "おおきい の「大」はどれ？",
    prompt_b: "いぬ の「犬」はどれ？",
  },
  {
    a: "人",
    b: "入",
    prompt_a: "ひと の「人」はどれ？",
    prompt_b: "はいる の「入」はどれ？",
  },
  {
    a: "日",
    b: "目",
    prompt_a: "ひ の「日」はどれ？",
    prompt_b: "め の「目」はどれ？",
  },
  {
    a: "木",
    b: "本",
    prompt_a: "き の「木」はどれ？",
    prompt_b: "もと の「本」はどれ？",
  },
  {
    a: "白",
    b: "百",
    prompt_a: "しろ の「白」はどれ？",
    prompt_b: "ひゃく の「百」はどれ？",
  },
  {
    a: "千",
    b: "干",
    prompt_a: "せん の「千」はどれ？",
    prompt_b: "ほす の「干」はどれ？",
  },
  {
    a: "牛",
    b: "午",
    prompt_a: "うし の「牛」はどれ？",
    prompt_b: "うま の「午」はどれ？",
  },
  {
    a: "刀",
    b: "力",
    prompt_a: "かたな の「刀」はどれ？",
    prompt_b: "ちから の「力」はどれ？",
  },
  {
    a: "白",
    b: "自",
    prompt_a: "しろい の「白」はどれ？",
    prompt_b: "みずから の「自」はどれ？",
  },
  {
    a: "貝",
    b: "見",
    prompt_a: "かい の「貝」はどれ？",
    prompt_b: "みる の「見」はどれ？",
  },
  {
    a: "母",
    b: "毎",
    prompt_a: "はは の「母」はどれ？",
    prompt_b: "ごと の「毎」はどれ？",
  },
  {
    a: "矢",
    b: "失",
    prompt_a: "や の「矢」はどれ？",
    prompt_b: "うしなう の「失」はどれ？",
  },
];
