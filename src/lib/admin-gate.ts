/**
 * Pure decision core of the admin dashboard's access gate (src/lib/server/
 * admin.ts) -- split out the same way subscribe-resolve.ts is split from
 * its own route/DB glue, so the plain node test runner can exercise every
 * branch directly (see scripts/admin-gate.test.ts) without Vite's `@/` path
 * aliasing.
 */

/** Real, fixed admin -- always allowed, independent of any env configuration. */
export const HARDCODED_ADMIN_EMAIL = "brian2023.tokyo@gmail.com";

/**
 * `adminEmailsEnv` is the raw `ADMIN_EMAILS` env value (comma-separated), or
 * unset/empty when no extra admins are configured -- the hardcoded email
 * above always passes regardless of it.
 */
export function isAdminEmail(
  email: string | null | undefined,
  adminEmailsEnv: string | null | undefined,
): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  if (normalized === HARDCODED_ADMIN_EMAIL) return true;
  const allowList = (adminEmailsEnv ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowList.includes(normalized);
}
