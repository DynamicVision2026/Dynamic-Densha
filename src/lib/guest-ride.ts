/** Guest funnel flags. Seeded demo greens must never count as "has progress". */

const RIDDEN_KEY = "densha.guest.ridden.v1";
const SAVE_PROMPT_KEY = "densha.guest.savePrompted.v1";

function readFlag(storage: Storage | undefined, key: string): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeFlag(storage: Storage | undefined, key: string) {
  if (!storage) return;
  try {
    storage.setItem(key, "1");
  } catch {
    /* ignore */
  }
}

function localStore(): Storage | undefined {
  if (typeof window === "undefined") return undefined;
  return window.localStorage;
}

function sessionStore(): Storage | undefined {
  if (typeof window === "undefined") return undefined;
  return window.sessionStorage;
}

/** True after the child has actually opened a ride (not merely seen the door). */
export function hasGuestRidden(): boolean {
  return readFlag(localStore(), RIDDEN_KEY);
}

export function markGuestRidden() {
  writeFlag(localStore(), RIDDEN_KEY);
}

/** Once per browser session: 到着 save prompt already offered. */
export function guestSavePromptedThisSession(): boolean {
  return readFlag(sessionStore(), SAVE_PROMPT_KEY);
}

export function markGuestSavePrompted() {
  writeFlag(sessionStore(), SAVE_PROMPT_KEY);
}
