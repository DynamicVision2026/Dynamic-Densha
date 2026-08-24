/** True when the app is framed (Grok side preview) — cookies may be blocked. */
export function inFramedPreview(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.self !== window.top) return true;
  } catch {
    return true;
  }
  return window.location.hostname.endsWith(".grok-sandbox.com");
}
