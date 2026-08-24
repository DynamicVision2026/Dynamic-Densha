import type { AssemblyPiece } from "./component-assembly.ts";
import type { StrokeDef } from "./stroke-assembly.ts";

export type StructureType = "primitive" | "compound";
export type StrokeSource = "kanjivg+redraw" | "manual" | "rules";

export type ShapePayload = {
  char: string;
  structure_type: StructureType;
  published_shape: boolean;
  strokes?: Array<StrokeDef & { order: number }>;
  components?: AssemblyPiece[];
  layout?: "row" | "col" | "tri";
  ghost?: string;
  stroke_source?: StrokeSource;
  gate_errors?: string[];
};

export type ShapeDraft = Omit<ShapePayload, "published_shape" | "gate_errors"> & {
  expected_strokes?: number;
};

export function autoGate(draft: ShapeDraft): ShapePayload {
  const errors: string[] = [];
  if (draft.structure_type !== "primitive" && draft.structure_type !== "compound") {
    errors.push("structure_type");
  }
  if (draft.structure_type === "primitive") {
    const strokes = draft.strokes ?? [];
    if (strokes.length < 1) errors.push("strokes.empty");
    const orders = strokes.map((s) => s.order);
    const expected = strokes.map((_, i) => i + 1);
    if (orders.join(",") !== expected.join(",")) errors.push("strokes.order");
    if (draft.expected_strokes != null && strokes.length !== draft.expected_strokes) {
      errors.push("strokes.count");
    }
    if (strokes.some((s) => !s.id || !s.path)) errors.push("strokes.path");
  }
  if (draft.structure_type === "compound") {
    const parts = draft.components ?? [];
    if (parts.length < 2) errors.push("components.empty");
    if (parts.some((p) => !p.id || !p.label || !p.path_or_asset)) errors.push("components.label");
  }
  return {
    ...draft,
    published_shape: errors.length === 0,
    gate_errors: errors.length ? errors : undefined,
    ghost: draft.ghost ?? draft.char,
  };
}
