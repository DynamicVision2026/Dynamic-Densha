/** Session だいたい rows for one punched stub. Compare dueIso as strings. */

export type SessionAlmostRow = {
  kanji: string;
  label: string;
  dueIso: string | null;
  dueLocalDate: string | null;
};

const ROWS_KEY = "densha.session.almost.v1";
const RETIRED_KEY = "densha.session.stub-retired.v1";

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export function readSessionAlmost(): SessionAlmostRow[] {
  const rows = readJson<SessionAlmostRow[]>(ROWS_KEY, []);
  return Array.isArray(rows) ? rows.filter((r) => r && r.kanji) : [];
}

export function rememberAlmost(row: SessionAlmostRow): SessionAlmostRow[] {
  const rows = readSessionAlmost().filter((r) => r.kanji !== row.kanji);
  rows.push({
    kanji: row.kanji,
    label: row.label,
    dueIso: row.dueIso,
    dueLocalDate: row.dueLocalDate,
  });
  writeJson(ROWS_KEY, rows);
  return rows;
}

export function stubRetired(): boolean {
  return readJson<string>(RETIRED_KEY, "") === "1";
}

export function retireStub() {
  writeJson(RETIRED_KEY, "1");
}

const PERFECT_KEY = "densha.session.perfect.v1";

export function rememberSessionPerfect(kanji: string) {
  const rows = readJson<string[]>(PERFECT_KEY, []);
  const next = Array.from(new Set([...rows, kanji]));
  writeJson(PERFECT_KEY, next);
  return next;
}

export function sessionHasPerfect(): boolean {
  return readJson<string[]>(PERFECT_KEY, []).length > 0;
}

/** Stub only for first だいたい. Perfect / day-eight coupling owns 到着. */
export function shouldShowSessionStub(input: {
  reachedAlmostThisSession: boolean;
  retired: boolean;
  currentStatus: string;
  sessionHasPerfect: boolean;
  glyphCount: number;
}): boolean {
  if (!input.reachedAlmostThisSession || input.retired) return false;
  if (input.glyphCount < 1) return false;
  if (input.sessionHasPerfect || input.currentStatus === "perfect") return false;
  return input.currentStatus === "almost";
}

/** Earliest return copy: min dueIso string. No Date.parse. */
export function earliestArrival(rows: SessionAlmostRow[]): SessionAlmostRow | null {
  if (!rows.length) return null;
  const dated = rows.filter((r) => r.dueIso);
  if (!dated.length) return rows[0] ?? null;
  return dated.reduce((a, b) => ((a.dueIso ?? "") <= (b.dueIso ?? "") ? a : b));
}