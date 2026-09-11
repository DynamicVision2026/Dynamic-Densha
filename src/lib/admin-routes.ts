/**
 * Where the admin console's auth lifecycle begins and ends, kept apart from
 * the consumer app's.
 *
 * The two surfaces share a session and a Google account, but nothing else:
 * an operator signing out of the console should land back at the console's
 * own door, not on a page that offers to set up a child's train. Pure (a
 * pathname in, a destination out, no `@/` aliases) so both branches are
 * unit-testable — scripts/admin-access.test.ts.
 */

/** The console's own sign-in page. Deliberately not /login. */
export const ADMIN_LOGIN_PATH = "/admin/login";

/** The consumer app's sign-in page, and where signing out of it returns you. */
export const CONSUMER_ROOT = "/";

/**
 * True for any page that belongs to the admin console. Prefix-matched so a
 * future /app/admin/… sub-page inherits the same auth entry and exit without
 * anyone having to remember to add it.
 */
export function isAdminSurface(pathname: string): boolean {
  return pathname === "/app/admin" || pathname.startsWith("/app/admin/");
}

/**
 * Where sign-out should land. From the console it is the console's own login
 * page: an operator who has just signed out is almost always about to sign
 * back in (often as a different account), and bouncing them through the
 * parent-facing door to get there is both confusing and slower.
 */
export function signOutDestinationFor(pathname: string): string {
  return isAdminSurface(pathname) ? ADMIN_LOGIN_PATH : CONSUMER_ROOT;
}

/** Where an authenticated admin belongs once the portal is done with them. */
export const ADMIN_HOME = "/app/admin";

/**
 * The admin portal's own `next` allow-list, deliberately narrower than the
 * consumer one (src/lib/post-auth-redirect.ts): /admin/login only ever hands
 * you back to an admin page. The consumer list has to include /subscribe and
 * /app/parent because that is where parents were going; the console has no
 * business bouncing anyone into a checkout, and `next` is attacker-supplied
 * on both surfaces, so the console keeps its own smaller set rather than
 * inheriting one that will keep growing.
 */
export function resolveAdminNext(next: string | undefined | null): string {
  if (!next) return ADMIN_HOME;
  if (!next.startsWith("/") || next.startsWith("//")) return ADMIN_HOME;
  if (next.includes("://")) return ADMIN_HOME;
  const path = next.split(/[?#]/)[0] ?? "";
  return isAdminSurface(path) ? next : ADMIN_HOME;
}
