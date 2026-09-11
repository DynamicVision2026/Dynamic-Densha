/**
 * Which child a bare /app visit should land on.
 *
 * The device-local hint is a CONVENIENCE ONLY. It is written by the browser,
 * read by the browser, and never sent to or trusted by the server -- the
 * server has no notion of an "active child" at all, which is what makes two
 * siblings on two devices (or one child across a phone and a tablet) work
 * without a shared mutable selection to get out of step. Everything a hint
 * can do is pick which of YOUR OWN children a redirect lands on; every
 * request that follows re-derives ownership from the session.
 *
 * Alias-free so the plain node test runner can exercise it.
 */

/** The hint's storage key. */
export const CHILD_HINT_KEY = "kd.lastChild";

/**
 * The key this app used before route scoping. Still read, never written: a
 * family already using the app has their selection here, and silently
 * resetting everyone to their first child on upgrade day is a worse outcome
 * than carrying one legacy key for a while.
 */
export const LEGACY_CHILD_HINT_KEY = "densha.activeChild";

export type ChildLike = { id: string };

/**
 * The hint if it still names one of this household's living children, else
 * the first of them, else null (no children -> the caller sends them to
 * /onboard).
 *
 * Validating against the list is the whole point: a hint can name a child
 * who has since been archived, or one from a different account that used
 * this browser. An unvalidated hint would put a stale id straight into the
 * URL, where the route guard would 404 it -- a family who did nothing wrong
 * would see "not found" on their own app.
 */
export function resolveInitialChildId(children: ChildLike[], hint: string | null): string | null {
  if (children.length === 0) return null;
  if (hint && children.some((c) => c.id === hint)) return hint;
  return children[0]!.id;
}
