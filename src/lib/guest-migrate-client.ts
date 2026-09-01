import { importGuestProgress } from "@/lib/server/guest-import";
import {
  DEMO_PROGRESS_KEY,
  GUEST_MIGRATED_KEY,
  parseGuestProgressMap,
} from "@/lib/guest-import";
import { guestSessionId } from "@/lib/guest-ride";

function readDemoRaw(): unknown {
  try {
    const raw = window.localStorage.getItem(DEMO_PROGRESS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Once after login, when a child id exists. Does not delete guest localStorage. */
export async function maybeImportGuestProgress(childId: string): Promise<void> {
  if (!childId || typeof window === "undefined") return;
  try {
    if (window.localStorage.getItem(GUEST_MIGRATED_KEY)) return;
    const rows = parseGuestProgressMap(readDemoRaw());
    await importGuestProgress({ data: { childId, rows, guestSessionId: guestSessionId() } });
    window.localStorage.setItem(GUEST_MIGRATED_KEY, "1");
  } catch {
    /* home still loads */
  }
}