/** One continuous switchback. Farther up the valley = smaller cars. */

export const SWITCHBACK_PATH =
  "M -80 412 L 344 412 C 374 412 374 346 344 346 L 16 346 C -14 346 -14 288 16 288 L 344 288 C 370 288 370 238 344 238 L 16 238 C -8 238 -8 196 16 196 L 210 196 L 430 174";

export const CAR_GAP = 54;
export const TRAIN_SPEED = 32;
export const LUT_STEP = 3;
export const CAR_CAP = 12;

export function scaleAt(y: number): number {
  return Math.max(0.3, Math.min(1, ((y - 168) / 244) * 0.78 + 0.28));
}

export function wrapHead(head: number, unitCount: number, length: number): number {
  const tail = head - unitCount * CAR_GAP;
  if (tail > length + 40) return 0;
  return head;
}

/** Place the consist on the near terrace so the opening frame is on-screen. */
export function openingHead(carCount: number, length: number): number {
  if (length <= 0) return 0;
  if (carCount <= 0) return Math.min(180, length * 0.12);
  // First run is y=412, x from -80. d≈100 is x≈20 — keep the tail on-canvas.
  return Math.min(length * 0.35, 100 + carCount * CAR_GAP);
}

export function sampleLut(
  getPoint: (d: number) => { x: number; y: number },
  length: number,
  step = LUT_STEP,
): [number, number][] {
  const lut: [number, number][] = [];
  for (let s = 0; s <= length; s += step) {
    const p = getPoint(s);
    lut.push([p.x, p.y]);
  }
  return lut;
}

export type CarPose = {
  x: number;
  y: number;
  scale: number;
  opacity: number;
  hidden: boolean;
};

export function poseAt(d: number, lut: [number, number][], length: number): CarPose {
  if (d < 0 || d > length || lut.length === 0) {
    return { x: 0, y: 0, scale: 1, opacity: 0, hidden: true };
  }
  const i = Math.max(0, Math.min(lut.length - 1, Math.round(d / LUT_STEP)));
  const pt = lut[i] ?? lut[0]!;
  const fade = d > length - 70 ? Math.max(0, (length - d) / 70) : 1;
  return {
    x: pt[0],
    y: pt[1],
    scale: scaleAt(pt[1]),
    opacity: fade,
    hidden: fade <= 0,
  };
}
