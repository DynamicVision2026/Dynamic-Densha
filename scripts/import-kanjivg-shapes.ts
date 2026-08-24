/**
 * Shape Data Gate pipeline (dev / CI only — never in the child browser).
 *
 * KanjiVG → classify → attach locked paths → auto-gate → publish only if green.
 *
 *   node --experimental-strip-types scripts/import-kanjivg-shapes.ts
 */
import { COMPOUND_DICTIONARY } from "../src/data/compound-dictionary.ts";
import { PRIMITIVE_CORES } from "../src/data/primitive-list.ts";
import { getStrokeAssembly, strokeAssemblyChars } from "../src/data/stroke-assembly.ts";
import { KYOIKU } from "../src/data/kyoiku.ts";
import { autoGate } from "../src/lib/shape-payload.ts";
import { classifyStructure, getPublishedShape } from "../src/data/shape-catalog.ts";

const summary = { primitive: 0, compound: 0, unpublished: 0, published: 0, fail: [] as string[] };

for (const k of KYOIKU) {
  const kind = classifyStructure(k.char);
  if (kind === "compound") summary.compound += 1;
  else if (kind === "primitive") summary.primitive += 1;
  else summary.unpublished += 1;

  const pub = getPublishedShape(k.char);
  if (pub) summary.published += 1;
  else if (kind) {
    const draft = autoGate({
      char: k.char,
      structure_type: kind,
      expected_strokes: k.strokes,
      strokes: getStrokeAssembly(k.char)?.strokes.map((s, i) => ({ ...s, order: i + 1 })),
      components: COMPOUND_DICTIONARY[k.char]?.labels.map((label, i) => ({
        id: `${k.char}-${i}`,
        label,
        path_or_asset: label,
        slot: i,
      })),
    });
    if (!draft.published_shape) summary.fail.push(`${k.char}:${draft.gate_errors?.join(",")}`);
  }
}

console.log(
  JSON.stringify(
    {
      kyoiku: KYOIKU.length,
      primitivesListed: PRIMITIVE_CORES.size,
      strokeFiles: strokeAssemblyChars().length,
      compounds: Object.keys(COMPOUND_DICTIONARY).length,
      classified: { primitive: summary.primitive, compound: summary.compound, none: summary.unpublished },
      published: summary.published,
      gateFails: summary.fail,
      childPath: "locked catalog only; no live KanjiVG / model split",
      credit: "KanjiVG / Ulrich Apel / CC BY-SA 3.0 — product redraws geometry",
    },
    null,
    2,
  ),
);
if (summary.fail.length) process.exitCode = 1;
