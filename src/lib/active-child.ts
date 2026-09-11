import { CHILD_HINT_KEY, LEGACY_CHILD_HINT_KEY } from "./child-route-resolve";

/**
 * The device-local "which child was last on this browser" hint.
 *
 * localStorage and nothing else. The server never reads this, never receives
 * it, and has no column for it -- see child-route-resolve.ts for why. Every
 * accessor swallows its own failure because private-mode and blocked storage
 * are ordinary, and a family whose browser refuses localStorage must still
 * be able to use the app (they land on their first child every time, which
 * is a mild annoyance, not a breakage).
 */

export function readActiveChildId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    // The legacy key is read as a fallback so an existing device keeps its
    // selection through the move to route scoping; nothing writes it.
    return (
      window.localStorage.getItem(CHILD_HINT_KEY) ??
      window.localStorage.getItem(LEGACY_CHILD_HINT_KEY)
    );
  } catch {
    return null;
  }
}

export function writeActiveChildId(id: string) {
  try {
    window.localStorage.setItem(CHILD_HINT_KEY, id);
  } catch {
    /* ignore */
  }
}
