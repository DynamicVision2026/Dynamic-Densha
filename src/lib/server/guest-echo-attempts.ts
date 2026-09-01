/**
 * PI-6: real-elapsed-time evidence for a guest's echo successes, independent
 * of the guest's own (client-side, forgeable) clock. `attested_at` is always
 * the DB server's `now()` — never a client-supplied timestamp — so recording
 * two attempts for the same kanji still requires genuinely waiting the real
 * gap between them, however the guest's device clock is set in between.
 */

type Sql = {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  <T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]>;
};

const MAX_ATTEMPT_NO = 10;

export function isValidAttemptNo(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= MAX_ATTEMPT_NO;
}

/** Idempotent: a retried client call for the same (session, kanji, attempt) is a no-op. */
export async function recordGuestEchoAttempt(
  sql: Sql,
  guestSessionId: string,
  kanji: string,
  attemptNo: number,
): Promise<void> {
  await sql.query(
    `insert into guest_echo_attempts (guest_session_id, kanji, attempt_no)
     values ($1,$2,$3)
     on conflict (guest_session_id, kanji, attempt_no) do nothing`,
    [guestSessionId, kanji, attemptNo],
  );
}

export async function loadGuestEchoAttempts(
  sql: Sql,
  guestSessionId: string,
  kanji: string,
): Promise<Map<number, string>> {
  const rows = await sql<{ attempt_no: number; attested_at: string }>`
    select attempt_no, attested_at from guest_echo_attempts
    where guest_session_id = ${guestSessionId} and kanji = ${kanji}
  `;
  const map = new Map<number, string>();
  for (const r of rows) map.set(Number(r.attempt_no), String(r.attested_at));
  return map;
}

/**
 * Real elapsed ms between attempt 1 and attempt `need`'s server-attested
 * timestamps, or `null` when either is missing — the caller must then treat
 * the claimed echo count as unverified rather than assume it was earned.
 */
export function attestedElapsedMs(
  attempts: Map<number, string>,
  need: number,
): number | null {
  const first = attempts.get(1);
  const last = attempts.get(need);
  if (!first || !last) return null;
  const a = Date.parse(first);
  const b = Date.parse(last);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return b - a;
}
