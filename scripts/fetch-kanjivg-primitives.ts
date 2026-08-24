/**
 * Offline-ish import: download KanjiVG SVGs, scale 109→100, emit stroke-assembly-extra.ts.
 * Never called from the child path.
 */
import { writeFileSync } from "node:fs";
import { getKanji } from "../src/data/kyoiku.ts";
import { compoundEntry } from "../src/data/compound-dictionary.ts";
import { getStrokeAssembly } from "../src/data/stroke-assembly.ts";

const CHARS = [
  "穴", "己", "尺", "寸", "舌", "片", "亡", "卵",
];

function kvgId(char: string): string {
  return (char.codePointAt(0) ?? 0).toString(16).padStart(5, "0");
}

function scalePath(d: string): string {
  return d.replace(/-?\d*\.?\d+/g, (n) => {
    const v = Number(n) * (100 / 109);
    return Number.isFinite(v) ? v.toFixed(2) : n;
  });
}

function labelFor(type: string): string {
  const t = type.replace(/^kvg:type=["']?/, "");
  if (t.startsWith("㇐") || t.includes("horizontal")) return "よこ";
  if (t.startsWith("㇑")) return "たて";
  if (t.startsWith("㇔")) return "てん";
  if (t.startsWith("㇕") || t.startsWith("㇖") || t.startsWith("㇗") || t.startsWith("㇙")) return "おれ";
  if (t.startsWith("㇒") || t.startsWith("㇓") || t.startsWith("㇏")) return "はらい";
  return "はらい";
}

async function fetchChar(char: string): Promise<{ char: string; strokes: Array<{ id: string; label: string; path: string }> } | null> {
  if (compoundEntry(char) || getStrokeAssembly(char)) return null;
  const id = kvgId(char);
  const url = `https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/${id}.svg`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${char} ${res.status}`);
  const svg = await res.text();
  const paths = [...svg.matchAll(/<path\b([^>]*)>/g)];
  const strokes = [];
  let i = 0;
  for (const m of paths) {
    const attrs = m[1] ?? "";
    if (!attrs.includes("kvg:type") && !attrs.includes("id=\"kvg:")) continue;
    const d = attrs.match(/\bd="([^"]+)"/)?.[1];
    const type = attrs.match(/kvg:type="([^"]+)"/)?.[1] ?? "";
    if (!d) continue;
    i += 1;
    strokes.push({
      id: `${char}-${i}`,
      label: labelFor(type),
      path: scalePath(d),
    });
  }
  if (!strokes.length) return null;
  const k = getKanji(char);
  if (k && k.strokes !== strokes.length) {
    console.error(`count mismatch ${char} kyoiku=${k.strokes} kvg=${strokes.length}`);
  }
  return { char, strokes };
}

const rows = [];
const failed = [];
for (const char of CHARS) {
  try {
    const row = await fetchChar(char);
    if (row) rows.push(row);
  } catch (e) {
    failed.push(`${char}: ${(e as Error).message}`);
  }
}

const body = `import type { StrokeAssembly } from "@/lib/stroke-assembly";

/** G6 remaining KanjiVG-scaled primitives. Paths 109→100. */
export const STROKE_ASSEMBLY_G6: StrokeAssembly[] = ${JSON.stringify(rows, null, 2)};
`;
writeFileSync(new URL("../src/data/stroke-assembly-g6.ts", import.meta.url), body);
console.log(JSON.stringify({ made: rows.length, failed }, null, 2));
if (failed.length) process.exitCode = 1;
