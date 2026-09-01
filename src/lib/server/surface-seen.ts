type Sql = {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  <T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]>;
};

/** Same parser as progress JSON columns. PGLite cannot reliably unnest the text JSON. */
export function parseStringList(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  try {
    const v = JSON.parse(String(raw));
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return String(raw)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
}

export function unionSurfaceIds(a: string[], b: string[]): string[] {
  const out = [...a];
  const seen = new Set(a);
  for (const id of b) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Append-only. Existing rows are never deleted or rewritten. */
export async function insertMissingSurfaceSeen(
  sql: Sql,
  userId: string,
  childId: string,
  kanji: string,
  surfaceIds: string[],
) {
  for (const surfaceId of surfaceIds) {
    if (!surfaceId) continue;
    await sql.query(
      `insert into surface_seen (user_id, child_id, kanji, surface_id)
       values ($1,$2,$3,$4)
       on conflict (child_id, surface_id) do nothing`,
      [userId, childId, kanji, surfaceId],
    );
  }
}

export async function loadSurfaceSeenByKanji(
  sql: Sql,
  userId: string,
  childId: string,
): Promise<Map<string, string[]>> {
  const rows = await sql<{ kanji: string; surface_id: string }>`
    select kanji, surface_id from surface_seen
    where child_id = ${childId} and user_id = ${userId}
  `;
  const map = new Map<string, string[]>();
  for (const r of rows) {
    const list = map.get(r.kanji);
    if (list) list.push(r.surface_id);
    else map.set(r.kanji, [r.surface_id]);
  }
  return map;
}

/** Copy JSON lists into surface_seen. Safe on empty tables. */
export async function backfillSurfaceSeenFromProgress(
  sql: Sql,
  userId: string,
  childId: string,
) {
  const rows = await sql<{ kanji: string; surfaces_seen_success: unknown }>`
    select kanji, surfaces_seen_success from kanji_progress
    where child_id = ${childId} and user_id = ${userId}
  `;
  for (const r of rows) {
    await insertMissingSurfaceSeen(
      sql,
      userId,
      childId,
      r.kanji,
      parseStringList(r.surfaces_seen_success),
    );
  }
}
