export type AssemblyPiece = {
  id: string;
  label: string;
  path_or_asset: string;
  slot: number;
};

export type ComponentAssembly = {
  char: string;
  layout?: "row" | "col" | "tri";
  components: AssemblyPiece[];
};

export const COMPONENT_COMPLETE_ID = "component:complete";
export const COMPONENT_SKIP_ID = "component:skip";

export function nextSlotIndex(placedCount: number): number {
  return placedCount;
}

export function neededPiece(
  assembly: ComponentAssembly,
  placedCount: number,
): AssemblyPiece | undefined {
  return assembly.components.find((c) => c.slot === placedCount);
}

export function canPlaceComponent(
  assembly: ComponentAssembly,
  placedIds: string[],
  pieceId: string,
): boolean {
  const needed = neededPiece(assembly, placedIds.length);
  const piece = assembly.components.find((c) => c.id === pieceId);
  if (!needed || !piece) return false;
  if (placedIds.includes(pieceId)) return false;
  return piece.label === needed.label;
}

export function isComponentComplete(assembly: ComponentAssembly, placedCount: number): boolean {
  return assembly.components.length > 0 && placedCount >= assembly.components.length;
}

export function pieceForSlot(assembly: ComponentAssembly, slot: number): AssemblyPiece | undefined {
  return assembly.components.find((c) => c.slot === slot);
}
