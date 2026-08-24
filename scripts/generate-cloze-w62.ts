/**
 * W6.2: emit cloze drafts from published word surfaces.
 * Editorial only; never called from the child path.
 */
import { writeFileSync } from "node:fs";
import { KYOIKU } from "../src/data/kyoiku.ts";
import { CLOZE_SELECT } from "../src/data/cloze-select.ts";
import { echoSurfacesFor, isWordSurface } from "../src/lib/echo-surfaces.ts";
import { decoyFor } from "../src/lib/confusable.ts";

function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function frameFrom(char: string): string | null {
  const words = echoSurfacesFor(char).filter((s) => isWordSurface(s) && s.kind !== "same_word_new_frame");
  for (const s of words) {
    if (!s.text.includes(char) || s.text === char) continue;
    const frame = `${s.text.replace(char, "___")}。`;
    if ((frame.match(/___/g) || []).length === 1) return frame;
  }
  return null;
}

function decoys(char: string, grade: number): [string, string] {
  const same = KYOIKU.filter((k) => k.grade === grade && k.char !== char).map((k) => k.char);
  const pair = decoyFor(char);
  const out: string[] = [];
  if (pair && pair !== char) out.push(pair);
  let h = hash(char);
  while (out.length < 2) {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    const c = same[h % same.length]!;
    if (c !== char && !out.includes(c)) out.push(c);
  }
  return [out[0]!, out[1]!];
}

function emitGrade(grade: number): string {
  const rows: string[] = [];
  for (const k of KYOIKU.filter((x) => x.grade === grade)) {
    if (CLOZE_SELECT[k.char]) continue;
    const frame = frameFrom(k.char);
    if (!frame) continue;
    const [d1, d2] = decoys(k.char, grade);
    const choices = JSON.stringify([k.char, d1, d2]);
    rows.push(
      `  ${k.char}: { frame_ja: ${JSON.stringify(frame)}, answer: ${JSON.stringify(k.char)}, choices: ${choices} },`,
    );
  }
  return `import type { ClozeDraft } from "./cloze-select.ts";

/** W6.2 G${grade} 選字填空 — surface-linked frames. */
export const CLOZE_SELECT_G${grade}: Record<string, ClozeDraft> = {
${rows.join("\n")}
};
`;
}

for (const g of [2, 3, 4, 5, 6]) {
  const body = emitGrade(g);
  writeFileSync(new URL(`../src/data/cloze-select-g${g}.ts`, import.meta.url), body);
  const n = body.split("\n").filter((l) => l.includes("frame_ja")).length;
  console.log("G" + g, n);
}
