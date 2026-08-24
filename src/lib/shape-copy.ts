import { compoundEntry } from "../data/compound-dictionary.ts";
import { structureType } from "./kanji-structure.ts";

const COUNT_JA = ["", "ひとつ", "ふたつ", "みっつ", "よっつ", "いつつ", "むっつ", "ななつ", "やっつ"];

/** Short editorial overlays. Missing → template from parts / stroke order. */
const EDITORIAL: Record<string, { hint: string; confirm: string }> = {
  林: { hint: "き が ふたつ", confirm: "木と木で 林" },
  森: { hint: "き が みっつ", confirm: "木と木と木で 森" },
  明: { hint: "ひ と つき", confirm: "日と月で 明" },
  休: { hint: "ひと と き", confirm: "人と木で 休" },
  王: { hint: "じゅんばんに おく", confirm: "じゅんばんどおり" },
};

function countJa(n: number): string {
  return COUNT_JA[n] ?? `${n}つ`;
}

function joinParts(labels: string[]): string {
  return labels.join("と");
}

export function structureHint(char: string): string | null {
  const editorial = EDITORIAL[char];
  if (editorial) return editorial.hint;
  const entry = compoundEntry(char);
  if (entry && entry.labels.length > 0) {
    const labels = entry.labels;
    const same = labels.every((l) => l === labels[0]);
    if (same && labels[0]) return `${labels[0]} が ${countJa(labels.length)}`;
    return labels.join(" と ");
  }
  if (structureType(char) === "primitive") return "じゅんばんに おく";
  return null;
}

export function structureConfirm(char: string): string | null {
  const editorial = EDITORIAL[char];
  if (editorial) return editorial.confirm;
  const entry = compoundEntry(char);
  if (entry && entry.labels.length > 0) {
    return `${joinParts(entry.labels)}で ${char}`;
  }
  if (structureType(char) === "primitive") return "じゅんばんどおり";
  return null;
}

export function structureRetry(char: string): string | null {
  return structureHint(char);
}
