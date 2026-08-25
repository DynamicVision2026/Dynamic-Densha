import { GRADE_COUNTS, KYOIKU, getKanji, trainsForGrade, type Grade, type KyoikuKanji } from "../data/kyoiku.ts";
import { foldReading } from "./readings.ts";

export const GRADES: Grade[] = [1, 2, 3, 4, 5, 6];

export type GradeSearch = { grade?: Grade };

export function parseGrade(v: unknown): Grade | undefined {
  if (typeof v === "number") {
    if (v === 1 || v === 2 || v === 3 || v === 4 || v === 5 || v === 6) return v;
    return undefined;
  }
  const raw = String(v ?? "")
    .trim()
    .replace(/^["']+|["']+$/g, "");
  const n = Number(raw);
  if (n === 1 || n === 2 || n === 3 || n === 4 || n === 5 || n === 6) return n;
  return undefined;
}

export function coerceGrade(v: unknown, fallback: Grade = 1): Grade {
  return parseGrade(v) ?? fallback;
}

export function gradeSearchFrom(s: Record<string, unknown>): GradeSearch {
  const grade = parseGrade(s.grade);
  return grade ? { grade } : {};
}

export type MapSearch = GradeSearch & { line?: string };
export type WorkshopSearch = GradeSearch & { family?: string };

export function mapSearchFrom(s: Record<string, unknown>): MapSearch {
  const grade = parseGrade(s.grade);
  const line = typeof s.line === "string" && s.line.startsWith("line_") ? s.line : undefined;
  return { ...(grade ? { grade } : {}), ...(line ? { line } : {}) };
}

export function workshopSearchFrom(s: Record<string, unknown>): WorkshopSearch {
  const grade = parseGrade(s.grade);
  const family =
    typeof s.family === "string" && /^[a-z][a-z0-9_]*$/i.test(s.family) ? s.family : undefined;
  return { ...(grade ? { grade } : {}), ...(family ? { family } : {}) };
}

export function parseGradeFromSearchStr(search: string): Grade | undefined {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  return parseGrade(new URLSearchParams(raw).get("grade"));
}

export function catalogSearchFrom(s: Record<string, unknown>): { grade?: Grade; q?: string } {
  const grade = parseGrade(s.grade);
  const q = typeof s.q === "string" ? s.q : undefined;
  return { ...(grade ? { grade } : {}), ...(q ? { q } : {}) };
}

export function searchKyoiku(query: string, grade?: Grade | "all"): KyoikuKanji[] {
  const pool = grade && grade !== "all" ? KYOIKU.filter((k) => k.grade === grade) : KYOIKU;
  const q = query.trim();
  if (!q) return pool;
  if (q.length === 1) {
    const exact = getKanji(q);
    if (exact && pool.some((k) => k.char === exact.char)) return [exact];
    if (exact) return [exact];
    return [];
  }
  const folded = foldReading(q);
  return pool.filter((k) => {
    if (k.char.includes(q) || k.meaningJa.includes(q)) return true;
    if (foldReading(k.meaningJa).includes(folded)) return true;
    if (k.on.some((r) => foldReading(r).includes(folded))) return true;
    if (k.kun.some((r) => foldReading(r).includes(folded))) return true;
    const el = k.elementaryReadings;
    if (el.onyomi.some((r) => foldReading(r).includes(folded))) return true;
    if (el.kunyomi.some((r) => foldReading(r).includes(folded))) return true;
    return false;
  });
}

export function resolveLookup(query: string): {
  hit: KyoikuKanji | undefined;
  inList: boolean;
} {
  const q = query.trim();
  if (!q) return { hit: undefined, inList: false };
  if (q.length === 1) {
    const hit = getKanji(q);
    return { hit, inList: Boolean(hit) };
  }
  const hits = searchKyoiku(q, "all");
  if (hits.length === 1) return { hit: hits[0], inList: true };
  return { hit: undefined, inList: hits.length > 0 };
}

export const TRAIN_COUNTS: Record<Grade, number> = {
  1: trainsForGrade(1).length,
  2: trainsForGrade(2).length,
  3: trainsForGrade(3).length,
  4: trainsForGrade(4).length,
  5: trainsForGrade(5).length,
  6: trainsForGrade(6).length,
};

export { GRADE_COUNTS };
