import { getRequest } from "@tanstack/react-start/server";
import { auth, authConfigured } from "./server";

/**
 * Server-side session resolution (server-only).
 *
 * Because this app runs its OWN Better Auth at same-origin `/api/auth/*`, the
 * session cookie is sent with every request to this app — server functions AND
 * SSR loaders included. So we resolve the user straight from the request cookies
 * via `auth.api.getSession` (no client-minted JWT needed). Never trust a
 * client-supplied user id — only the result of this verification.
 */

/** True when a real database is configured server-side. */
const databaseConfigured = Boolean(process.env.DATABASE_URL?.trim());

/** Re-export so callers can branch on it without importing `server.ts`. */
export { authConfigured };

if (databaseConfigured && !authConfigured) {
  console.error(
    "[auth] DATABASE_URL is set but no sign-in method is configured (neither " +
      "GROK_AUTH_*/GROK_PREVIEW_CLIENT_SECRET nor GOOGLE_CLIENT_ID/" +
      "GOOGLE_CLIENT_SECRET, or VITE_AUTH_ENABLED=false) — requireUserId() " +
      "will reject every request (fail closed) rather than share one dev " +
      "user on a real database.",
  );
}

/** Dev fallback user id, used only when auth is disabled (VITE_AUTH_ENABLED=false). */
export const DEV_USER_ID = "dev-user";

/**
 * Thrown by `requireUserId` when the caller has no valid session. Carries
 * `status: 401`; the message is a stable contract — match
 * `err.message === "Unauthorized"` client-side to send the visitor to sign-in.
 */
export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

export type VerifiedUser = { id: string; email: string | null };

/**
 * Resolve the signed-in user from the current request, or `null` when auth isn't
 * configured / nobody is signed in. Safe to call from server functions and SSR
 * loaders.
 *
 * `bearerToken` is for the LIVE PREVIEW: the app runs in a partitioned iframe
 * whose cookies don't reach the server, so `authMiddleware` forwards the session
 * as a bearer token, which we present as `Authorization: Bearer …` (the `bearer`
 * plugin resolves it). When deployed no token is passed and the cookie is used.
 */
export async function getSessionUser(
  bearerToken?: string,
): Promise<VerifiedUser | null> {
  if (!authConfigured) return null;
  const request = getRequest();
  if (!request) return null;
  let headers = request.headers;
  if (bearerToken) {
    headers = new Headers(request.headers);
    headers.set("Authorization", `Bearer ${bearerToken}`);
  }
  const session = await auth.api.getSession({ headers });
  if (!session?.user) return null;
  return { id: session.user.id, email: session.user.email ?? null };
}

/**
 * Resolve the current user id for a server function, or throw when unauthorized.
 * Prefer `authMiddleware` (`./middleware`), which calls this for you.
 * - Auth enabled -> the verified session user id; throws
 *   `UnauthorizedError` when signed out. Works in the sandbox preview too (real
 *   sign-in via the baked preview client).
 * - Auth disabled (`VITE_AUTH_ENABLED=false`) + `DATABASE_URL` set -> throw (fail
 *   closed): one shared dev user on a real database would let every visitor
 *   read/write everyone's rows.
 * - Auth disabled + no database -> the shared dev user id.
 */
/**
 * Same resolution rules as `requireUserId`, but for callers that already
 * hold the raw platform `Request` (a `server: { handlers }` route, e.g.
 * src/routes/subscribe.ts) rather than a `createServerFn` context -- and
 * that want `null` instead of a thrown `UnauthorizedError` on a signed-out
 * visitor, since "no session" is one branch of ordinary control flow there,
 * not a failure. Takes `headers` directly instead of going through
 * `getRequest()` + a forwarded bearer token: a route handler already has
 * the exact request Better Auth needs to read the session cookie from, so
 * there is nothing to reconstruct.
 */
export async function resolveUserIdFromHeaders(headers: Headers): Promise<string | null> {
  if (!authConfigured) {
    if (databaseConfigured) return null; // fail closed -- see requireUserId's own comment
    return DEV_USER_ID;
  }
  const session = await auth.api.getSession({ headers });
  return session?.user?.id ?? null;
}

export async function requireUserId(bearerToken?: string): Promise<string> {
  if (!authConfigured) {
    if (databaseConfigured) {
      throw new Error(
        "No sign-in method is configured (see the '[auth]' console.error " +
          "logged at module load for which env vars are missing) but " +
          "DATABASE_URL is set — refusing to fall back to the shared dev " +
          "user against a real database.",
      );
    }
    return DEV_USER_ID;
  }
  const user = await getSessionUser(bearerToken);
  if (!user) throw new UnauthorizedError();
  return user.id;
}
