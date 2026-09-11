/**
 * Where a visitor lands after signing in, when they arrived via `?next=…`
 * (the /subscribe resolver's redirect to /login is the main source; see
 * src/routes/subscribe.ts). `next` is attacker-controllable -- anyone can
 * hand out `https://app.kanji-ai.jp/login?next=https://evil.example` -- so
 * this is an allow-list, not a sanitizer: only these FOUR exact same-origin
 * paths (any query string of their own is fine) are ever honored.
 * Everything else, including a same-origin path that isn't one of these
 * four, falls back to "/app". An open redirect straight off a payment/auth
 * route is a phishing primitive, not a convenience worth the risk.
 *
 * /app/admin is on the list because without it an admin signing in could
 * not be returned to the dashboard at all: `next` fell back to "/app",
 * which funnels a childless account straight into the register-a-child
 * form. Being on this list grants nothing — /app/admin does its own
 * server-side authorization (src/lib/server/admin.ts) and shows a
 * non-admin a 403, so the worst an attacker achieves by handing someone a
 * ?next=/app/admin link is sending them to a page that refuses them.
 *
 * Pure and client-safe on purpose: both src/routes/login.tsx and
 * src/routes/onboard.tsx read `next` from the URL and must apply the same
 * check before ever handing it to `window.location.href`.
 */
const ALLOWED_NEXT_PATHS = new Set([
  "/subscribe",
  "/app/parent",
  "/app",
  "/app/admin",
  // The order-confirmation email's link. A parent opening it days later on a
  // device with no session must come back to their pass, not to /app --
  // /subscribe/success is a permanent, idempotent view of entitlement, so
  // returning to it is always safe.
  "/subscribe/success",
]);

export function isAllowedNext(next: string | undefined | null): next is string {
  if (!next) return false;
  if (!next.startsWith("/") || next.startsWith("//")) return false;
  // Blanket, not path-only -- a scheme anywhere in the string (including a
  // query string tacked onto an otherwise allow-listed path) is rejected
  // rather than reasoned about case by case.
  if (next.includes("://")) return false;
  const path = next.split(/[?#]/)[0];
  return ALLOWED_NEXT_PATHS.has(path);
}

/** `next` if (and only if) it passes `isAllowedNext`, else the default "/app". */
export function resolvePostAuthNext(next: string | undefined | null): string {
  return isAllowedNext(next) ? next : "/app";
}
