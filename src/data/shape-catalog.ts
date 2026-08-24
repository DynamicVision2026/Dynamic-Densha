import { getKanji } from "./kyoiku.ts";
import { compoundEntry } from "./compound-dictionary.ts";
import { isPrimitiveCore } from "./primitive-list.ts";
import { getStrokeAssembly } from "./stroke-assembly.ts";
import { autoGate, type ShapePayload, type StructureType } from "../lib/shape-payload.ts";
import type { ComponentAssembly } from "../lib/component-assembly.ts";
import type { StrokeAssembly } from "../lib/stroke-assembly.ts";

function primitiveDraft(char: string): ShapePayload | undefined {
  const row = getStrokeAssembly(char);
  if (!row) return undefined;
  const k = getKanji(char);
  return autoGate({
    char,
    structure_type: "primitive",
    strokes: row.strokes.map((s, i) => ({ ...s, order: i + 1 })),
    ghost: char,
    stroke_source: "kanjivg+redraw",
    expected_strokes: k?.strokes,
  });
}

function compoundDraft(char: string): ShapePayload | undefined {
  const entry = compoundEntry(char);
  if (!entry) return undefined;
  return autoGate({
    char,
    structure_type: "compound",
    layout: entry.layout,
    ghost: char,
    stroke_source: "rules",
    components: entry.labels.map((label, i) => ({
      id: `${char}-${i}`,
      label,
      path_or_asset: label,
      slot: i,
    })),
  });
}

/** Classify without live AI. Compound dictionary wins. Low confidence → no payload. */
export function classifyStructure(char: string): StructureType | null {
  if (compoundEntry(char)) return "compound";
  if (isPrimitiveCore(char) || getStrokeAssembly(char)) return "primitive";
  return null;
}

export function getShapePayload(char: string): ShapePayload | undefined {
  const kind = classifyStructure(char);
  if (kind === "compound") return compoundDraft(char);
  if (kind === "primitive") return primitiveDraft(char);
  return undefined;
}

export function getPublishedShape(char: string): ShapePayload | undefined {
  const row = getShapePayload(char);
  return row?.published_shape ? row : undefined;
}

export function publishedStrokeAssembly(char: string): StrokeAssembly | undefined {
  const row = getPublishedShape(char);
  if (!row || row.structure_type !== "primitive" || !row.strokes?.length) return undefined;
  return { char, strokes: row.strokes };
}

export function publishedComponentAssembly(char: string): ComponentAssembly | undefined {
  const row = getPublishedShape(char);
  if (!row || row.structure_type !== "compound" || !row.components?.length) return undefined;
  return { char, layout: row.layout, components: row.components };
}
