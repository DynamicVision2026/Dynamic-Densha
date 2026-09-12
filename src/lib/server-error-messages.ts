import type { MessageKey } from "@/lib/i18n/messages";

/**
 * Server functions throw with a fixed ja string -- there is no locale in
 * scope when `src/lib/server/children.ts` (or coverage.ts, pass.ts,
 * grade-route.ts, insights.ts) decides a request is invalid, so the message
 * they throw with has always been Japanese, by construction rather than
 * oversight.
 *
 * The bug was on the CLIENT side: several catch blocks rendered that raw
 * `err.message` straight into the UI (`setError(err instanceof Error ?
 * err.message : t("saveFailed"))`), which is correct in ja and a leak in
 * every other locale -- an English- or Chinese-reading parent would see a
 * bare Japanese sentence the moment a validator rejected their input.
 *
 * This is the boundary that closes it: an exact table from each known
 * server string to the MessageKey that says the same thing in the caller's
 * own locale, and one function that walks it. `resolveServerErrorMessage`
 * never returns a string it doesn't recognise -- an error the table hasn't
 * seen yet (a future validator, a typo'd rethrow) falls back to
 * `t("saveFailed")` rather than ever showing raw ja to a non-ja reader.
 *
 * Deliberately NOT covering src/routes/login.tsx's Better Auth errors (e.g.
 * "User already exists. Use another email.") -- those come from the auth
 * library's own internals, in English, regardless of the app's locale; a
 * matching fix there means mapping Better Auth's own message catalogue, a
 * separate and much larger job than this table.
 */
const KNOWN_SERVER_ERRORS: Record<string, MessageKey> = {
  "お名前を入力してください": "childNameRequired",
  "学年の指定が正しくありません": "invalidGradeInput",
  "リクエストが正しくありません": "invalidRequest",
  "こどもの保存に失敗しました": "saveFailed",
  "お子さまの情報が見つかりません": "childNotFound",
  "最後のお一人は非表示にできません": "lastChildCannotHide",
  "乗りはじめが正しくありません": "invalidStartBand",
};

/**
 * `err` is whatever a catch block caught from a server function call;
 * `t` is the caller's own `useI18n().t`. Always returns a string safe to
 * render in the caller's current locale.
 */
export function resolveServerErrorMessage(
  err: unknown,
  t: (key: MessageKey) => string,
): string {
  const raw = err instanceof Error ? err.message : undefined;
  const key = raw ? KNOWN_SERVER_ERRORS[raw] : undefined;
  return t(key ?? "saveFailed");
}
