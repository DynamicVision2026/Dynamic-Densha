import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { isValidAttemptNo, recordGuestEchoAttempt } from "@/lib/server/guest-echo-attempts";

/**
 * Unauthenticated by design (the whole point is to attest guest play before
 * any account exists) and idempotent (a duplicate call for the same attempt
 * is a no-op). Never throws on bad input — this is best-effort evidence, not
 * something that should be able to break the ride if it fails.
 */
export const attestGuestEcho = createServerFn({ method: "POST" })
  .validator((input: { guestSessionId: string; kanji: string; attemptNo: number }) => ({
    guestSessionId: String(input.guestSessionId ?? "").slice(0, 64),
    kanji: String(input.kanji ?? "").slice(0, 8),
    attemptNo: input.attemptNo,
  }))
  .handler(async ({ data }) => {
    if (!data.guestSessionId || !data.kanji || !isValidAttemptNo(data.attemptNo)) {
      return { ok: false };
    }
    const sql = await getSql();
    await recordGuestEchoAttempt(sql, data.guestSessionId, data.kanji, data.attemptNo);
    return { ok: true };
  });
