import { classifyStructure, getPublishedShape } from "../data/shape-catalog.ts";

export type StructureType = "primitive" | "compound";

export function structureType(char: string): StructureType {
  return classifyStructure(char) ?? "primitive";
}

export function shapeModeFor(char: string): "stroke" | "component" | "none" {
  const row = getPublishedShape(char);
  if (!row) return "none";
  return row.structure_type === "compound" ? "component" : "stroke";
}
