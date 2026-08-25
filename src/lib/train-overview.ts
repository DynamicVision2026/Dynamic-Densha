import { GRADE_COUNTS, trainsForGrade, type Grade } from "../data/kyoiku.ts";
import { KANJI_LINES } from "../data/lines.ts";
import type { MasteryStatus } from "./mastery.ts";
import type { ProgressState } from "./progress-eval.ts";

export type GradeRingView = {
  grade: Grade;
  total: number;
  perfect: number;
  ridden: number;
  open: boolean;
  complete: boolean;
  /** Perfect cars in curriculum order (already coupled). */
  consist: string[];
};

export type OverviewIntent = {
  open?: boolean;
  focusChar?: string;
  glow?: string[];
  gradeComplete?: boolean;
};

const INTENT_KEY = "densha.overview.intent.v1";
const COUPLE_KEY = "densha.couple.pending.v1";

const GRADES: Grade[] = [1, 2, 3, 4, 5, 6];

function statusOf(
  progress: Map<string, ProgressState> | Record<string, ProgressState>,
  char: string,
): MasteryStatus {
  if (progress instanceof Map) return progress.get(char)?.status ?? "new";
  return progress[char]?.status ?? "new";
}

/** Aggregates per grade. Only iterates open-grade trains — never all 1026 on home. */
export function buildGradeRings(input: {
  progress: Map<string, ProgressState> | Record<string, ProgressState>;
  profileGrade: Grade;
}): GradeRingView[] {
  const profile = input.profileGrade;
  return GRADES.map((grade) => {
    const total = GRADE_COUNTS[grade];
    const open = grade <= profile;
    if (!open) {
      return {
        grade,
        total,
        perfect: 0,
        ridden: 0,
        open: false,
        complete: false,
        consist: [],
      };
    }
    const chars = trainsForGrade(grade).flatMap((t) => t.chars);
    const consist: string[] = [];
    let ridden = 0;
    for (const char of chars) {
      const st = statusOf(input.progress, char);
      if (st !== "new") ridden += 1;
      if (st === "perfect") consist.push(char);
    }
    return {
      grade,
      total,
      perfect: consist.length,
      ridden,
      open: true,
      complete: consist.length >= total && total > 0,
      consist,
    };
  });
}

export function ringFor(rings: GradeRingView[], grade: Grade): GradeRingView | undefined {
  return rings.find((r) => r.grade === grade);
}

export function hubCounts(rings: GradeRingView[], grade: Grade): { green: number; ridden: number } {
  const row = ringFor(rings, grade);
  return { green: row?.perfect ?? 0, ridden: row?.ridden ?? 0 };
}

/** Family-line spokes for the optional 「せんを みる」 overlay. */
export function familyRadials(rings: GradeRingView[]): {
  id: string;
  points: { grade: Grade; kanji: string; index: number; total: number }[];
}[] {
  const open = new Set(rings.filter((r) => r.open).map((r) => r.grade));
  const indexOf = new Map<string, { grade: Grade; index: number; total: number }>();
  for (const ring of rings) {
    if (!ring.open) continue;
    const chars = trainsForGrade(ring.grade).flatMap((t) => t.chars);
    chars.forEach((kanji, index) => {
      indexOf.set(kanji, { grade: ring.grade, index, total: chars.length || 1 });
    });
  }
  return KANJI_LINES.map((line) => ({
    id: line.id,
    points: line.stations
      .filter((s) => open.has(s.grade as Grade))
      .map((s) => {
        const hit = indexOf.get(s.kanji);
        return hit
          ? { grade: hit.grade, kanji: s.kanji, index: hit.index, total: hit.total }
          : null;
      })
      .filter((p): p is { grade: Grade; kanji: string; index: number; total: number } => Boolean(p)),
  })).filter((line) => line.points.length >= 2);
}

export function writeOverviewIntent(intent: OverviewIntent) {
  if (typeof window === "undefined") return;
  try {
    const prev = readOverviewIntent() ?? {};
    window.sessionStorage.setItem(INTENT_KEY, JSON.stringify({ ...prev, ...intent }));
  } catch {
    /* ignore */
  }
}

export function readOverviewIntent(): OverviewIntent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(INTENT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as OverviewIntent;
  } catch {
    return null;
  }
}

export function clearOverviewOpen() {
  const prev = readOverviewIntent();
  if (!prev) return;
  writeOverviewIntent({ ...prev, open: false, focusChar: undefined, gradeComplete: false });
}

export function clearOverviewGlow() {
  const prev = readOverviewIntent();
  if (!prev) return;
  writeOverviewIntent({ ...prev, glow: [] });
}

export function pushCouplePending(char: string) {
  if (typeof window === "undefined") return;
  try {
    const cur = takeCouplePendingPeek();
    if (!cur.includes(char)) cur.push(char);
    window.sessionStorage.setItem(COUPLE_KEY, JSON.stringify(cur));
  } catch {
    /* ignore */
  }
}

export function takeCouplePendingPeek(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(COUPLE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function takeCouplePending(): string[] {
  const cur = takeCouplePendingPeek();
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.removeItem(COUPLE_KEY);
    } catch {
      /* ignore */
    }
  }
  return cur;
}
