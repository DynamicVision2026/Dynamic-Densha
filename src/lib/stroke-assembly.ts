export type StrokeBBox = { x: number; y: number; w: number; h: number };

export type StrokeDef = {
  id: string;
  label?: string;
  path: string;
  target_bbox?: StrokeBBox;
};

export type StrokeComponent = {
  id: string;
  stroke_ids: string[];
};

export type StrokeAssembly = {
  char: string;
  strokes: StrokeDef[];
  components?: StrokeComponent[];
};

export const STROKE_COMPLETE_ID = "stroke:complete";
export const STROKE_SKIP_ID = "stroke:skip";

export function isNextStroke(
  assembly: StrokeAssembly,
  placedCount: number,
  strokeId: string,
): boolean {
  return assembly.strokes[placedCount]?.id === strokeId;
}

export function isAssemblyComplete(assembly: StrokeAssembly, placedCount: number): boolean {
  return assembly.strokes.length > 0 && placedCount >= assembly.strokes.length;
}

export function nextStroke(assembly: StrokeAssembly, placedCount: number): StrokeDef | undefined {
  return assembly.strokes[placedCount];
}

function pathStart(path: string): { x: number; y: number } {
  const m = path.match(/[Mm]\s*([\d.]+)[,\s]+([\d.]+)/);
  return { x: m ? Number(m[1]) : 50, y: m ? Number(m[2]) : 50 };
}

/** Unique AT name: 1画目・上のよこ vs 2画目・中のよこ when labels collide. */
export function strokeCandidateName(assembly: StrokeAssembly, index: number): string {
  const stroke = assembly.strokes[index];
  if (!stroke) return `${index + 1}画目`;
  const label = stroke.label?.trim() || "画";
  const n = `${index + 1}画目`;
  const same = assembly.strokes
    .map((s, i) => ({ s, i, start: pathStart(s.path) }))
    .filter((row) => (row.s.label?.trim() || "画") === label);
  if (same.length <= 1) return `${n}・${label}`;

  const vertical = label.includes("たて") || label.includes("縦");
  same.sort((a, b) => (vertical ? a.start.x - b.start.x : a.start.y - b.start.y));
  const pos = same.findIndex((row) => row.s.id === stroke.id);
  const hint =
    pos <= 0 ? (vertical ? "左" : "上") : pos >= same.length - 1 ? (vertical ? "右" : "下") : "中";
  return `${n}・${hint}の${label}`;
}
