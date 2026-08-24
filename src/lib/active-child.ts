const KEY = "densha.activeChild";

export function readActiveChildId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function writeActiveChildId(id: string) {
  try {
    window.localStorage.setItem(KEY, id);
  } catch {
    /* ignore */
  }
}
