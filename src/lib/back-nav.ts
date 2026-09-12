/**
 * Where もどる goes, for the chrome that has to decide it (AppShell).
 *
 * It used to be derived from the path alone, with `/demo` as the fallback for
 * anything that was neither `/app…` nor `/demo…`. Exactly one route is in that
 * position -- `/onboard` -- and the fallback sent a signed-in parent who
 * tapped 「＋ 追加」 and then changed their mind out of the app entirely, into
 * the marketing demo. A parent adding a second child had no way back to the
 * page they came from.
 *
 * Kept as a pure function rather than inlined in the component so the whole
 * table is testable without a router, a browser or a session -- and so the
 * loop below is stated once, in the open.
 */
export type BackTarget = "/app" | "/demo" | "/app/parent/settings";

export function backTargetFor(input: {
  path: string;
  /** A verified session exists. A signed-out visitor belongs on /demo. */
  signedIn: boolean;
  /** /onboard reached deliberately by a household that already has children. */
  addingChild?: boolean;
}): BackTarget | null {
  const { path, signedIn, addingChild } = input;

  // The two child surfaces are their own homes; unchanged.
  if (path.startsWith("/demo")) return "/demo";
  if (path.startsWith("/app")) return "/app";

  if (path.startsWith("/onboard")) {
    // Came from the settings hub's 「＋ 追加」, so that is where もどる goes.
    if (addingChild) return "/app/parent/settings";
    // A childless parent's first run: /app redirects straight back here,
    // because a household with no child has nothing else to show. A link that
    // returns you to the page you are on is worse than no link, and sending
    // them to /demo -- the guest tour -- is how this bug started. So: none.
    if (signedIn) return null;
    return "/demo";
  }

  // Any future route outside both prefixes: a signed-in visitor goes to their
  // app, never to the marketing surface.
  return signedIn ? "/app" : "/demo";
}
