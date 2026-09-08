/**
 * Where a visitor lands after signing in, when they arrived via `?next=…`
 * (the /subscribe resolver's redirect to /login is the main source; see
 * src/routes/subscribe.ts). `next` is attacker-controllable -- anyone can
 * hand out `https://app.kanji-ai.jp/login?next=https://evil.example` -- so
 * this is an allow-list, not a sanitizer: only these THREE exact
 * same-origin paths (any query string of their own is fine) are ever
 * honored. Everything else, including a same-origin path that isn't one of
 * these three, falls back to "/app". An open redirect straight off a
 * payment/auth route is a phishing primitive, not a convenience worth the
 * risk.
 *
 * Pure and client-safe on purpose: both src/routes/login.tsx and
 * src/routes/onboard.tsx read `next` from the URL and must apply the same
 * check before ever handing it to `window.location.href`.
 */
const ALLOWED_NEXT_PATHS = new Set(["/subscribe", "/app/parent", "/app"]);

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
