/**
 * Which add-to-home-screen instructions to show. Pure (a user-agent string
 * in, a platform out, no `@/` aliases) so the branches are unit-testable
 * without a browser -- scripts/install-platform.test.ts.
 *
 * iOS Safari fires no `beforeinstallprompt` and has no install button at
 * all, so it needs drawn instructions; Chrome (Android and desktop) does
 * fire one and gets a real button, falling back to instructions if the
 * event never arrives (already installed, or the browser's own heuristics
 * decline to offer it).
 */
export type InstallPlatform = "ios" | "android" | "other";

export function detectInstallPlatform(userAgent: string, maxTouchPoints = 0): InstallPlatform {
  const ua = userAgent || "";
  // iPadOS 13+ reports itself as Macintosh; the touch points are what give
  // it away, which is why this takes them rather than sniffing UA alone.
  const isIpadOs = /Macintosh/.test(ua) && maxTouchPoints > 1;
  if (/iPad|iPhone|iPod/.test(ua) || isIpadOs) return "ios";
  if (/Android/.test(ua)) return "android";
  return "other";
}

/** True once the app is already running from the home screen, where the guide is noise. */
export function isStandaloneDisplay(input: {
  displayModeStandalone: boolean;
  navigatorStandalone?: boolean;
}): boolean {
  return input.displayModeStandalone || input.navigatorStandalone === true;
}
