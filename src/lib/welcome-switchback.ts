/** One continuous switchback. Farther up the valley = smaller cars.
 * Hairpin radius ≥ 60px so a car length (~52) fits the turn without stacking.
 */

export const SWITCHBACK_PATH =
  "M -80 430 L 338 430 C 403 430 403 300 338 300 L 22 300 C -38 300 -38 180 22 180 L 338 180 C 398 180 398 60 338 60 L 210 60 L 430 42";

export const CAR_GAP = 54;
export const TRAIN_SPEED = 32;
export const LUT_STEP = 3;
export const CAR_CAP = 12;

/** Distance of the first landing (y≈300) on SWITCHBACK_PATH. Fallback if LUT is empty. */
export const FIRST_CLIMB_D = 620;

export function scaleAt(y: number): number {
  return Math.max(0.3, Math.min(1, ((y - 50) / 380) * 0.78 + 0.28));
}

/** First terrace landing so a consist already shows the 之字. */
export function firstClimbDistance(lut: [number, number][]): number {
  if (lut.length < 4) return FIRST_CLIMB_D;
  const y0 = lut[0]![1];
  let dropping = false;
  for (let i = 1; i < lut.length; i++) {
    const y = lut[i]![1];
    const prev = lut[i - 1]![1];
    if (y < prev - 0.8) dropping = true;
    if (dropping && Math.abs(y - prev) < 0.25 && y < y0 - 20) {
      return i * LUT_STEP;
    }
  }
  return FIRST_CLIMB_D;
}

export function wrapHead(head: number, unitCount: number, length: number, climb = FIRST_CLIMB_D): number {
  const tail = head - unitCount * CAR_GAP;
  if (tail > length + 40) return openingHead(Math.max(0, unitCount - 1), length, climb);
  return head;
}

/**
 * Place the consist entering from the bottom-most run.
 * 1+ cars: tail starts just onto the visible canvas, so every entrance
 * (initial mount and each loop restart) genuinely comes from the bottom-left.
 * 0 cars: idle engine on the near run.
 */
export function openingHead(carCount: number, length: number, _climb = FIRST_CLIMB_D): number {
  if (length <= 0) return 0;
  if (carCount <= 0) return Math.min(180, length * 0.12);
  const trainLen = (carCount + 1) * CAR_GAP;
  const tailMin = 88;
  const minHead = tailMin + trainLen;
  return Math.min(length * 0.4, minHead);
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
  /** Degrees. Roof stays up (side-view cars are not inverted on leftbound runs). */
  angle: number;
};

function headingDeg(dx: number, dy: number): number {
  let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (deg > 90 || deg < -90) deg += 180;
  return deg;
}

export function poseAt(d: number, lut: [number, number][], length: number): CarPose {
  if (d < 0 || d > length || lut.length === 0) {
    return { x: 0, y: 0, scale: 1, opacity: 0, hidden: true, angle: 0 };
  }
  const raw = d / LUT_STEP;
  const i0 = Math.max(0, Math.min(lut.length - 1, Math.floor(raw)));
  const i1 = Math.max(0, Math.min(lut.length - 1, i0 + 1));
  const t = raw - Math.floor(raw);
  const a = lut[i0] ?? lut[0]!;
  const b = lut[i1] ?? a;
  const x = a[0] + (b[0] - a[0]) * t;
  const y = a[1] + (b[1] - a[1]) * t;
  const iPrev = Math.max(0, i0 - 1);
  const iNext = Math.min(lut.length - 1, i0 + 1);
  const p0 = lut[iPrev] ?? a;
  const p1 = lut[iNext] ?? b;
  const fade = d > length - 70 ? Math.max(0, (length - d) / 70) : 1;
  return {
    x,
    y,
    scale: scaleAt(y),
    opacity: fade,
    hidden: fade <= 0,
    angle: headingDeg(p1[0] - p0[0], p1[1] - p0[1]),
  };
}
