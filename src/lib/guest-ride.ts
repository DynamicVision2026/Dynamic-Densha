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

const GUEST_SESSION_ID_KEY = "densha.guest.session-id.v1";

/**
 * Correlation key only — never an identity. Lets the server attest, per echo,
 * that real elapsed time passed between a guest's two echo successes for a
 * given kanji (see guest-echo-attempts.ts / PI-6), independent of the guest
 * device's own clock. Not sent anywhere except that attestation call, and not
 * imported into the account on login (guest-migrate-client.ts sends it once
 * for verification, then it's never needed again).
 */
export function guestSessionId(): string {
  const storage = localStore();
  if (!storage) return "";
  try {
    const existing = storage.getItem(GUEST_SESSION_ID_KEY);
    if (existing) return existing;
    const id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `g-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    storage.setItem(GUEST_SESSION_ID_KEY, id);
    return id;
  } catch {
    return "";
  }
}
