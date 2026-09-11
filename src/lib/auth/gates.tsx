import { useState, type ReactNode } from "react";
import { Navigate, useRouterState } from "@tanstack/react-router";
import { authEnabled, signOut } from "./client";
import { signOutDestinationFor } from "../admin-routes";
import { useCurrentUser, useCurrentUserState } from "./use-current-user";

/**
 * Auth state components — plain wrappers around `useCurrentUserState()`.
 *
 * With auth on, visitors are signed out until they authenticate — in the sandbox
 * live preview too, which does real sign-in. The shared dev user appears only
 * when auth is disabled (`VITE_AUTH_ENABLED=false`, the shipped default).
 * While the session is still resolving, gates that care about signed-out state
 * render nothing so there's no signed-out flash on hard reload.
 */

/** Where `RedirectToSignIn` sends signed-out visitors. Create this route. */
export const SIGN_IN_PATH = "/login";

/** Render children only when a user is present (real session, or the disabled-auth dev user). */
export function SignedIn({ children }: { children: ReactNode }) {
  const { user } = useCurrentUserState();
  return user ? <>{children}</> : null;
}

/**
 * Render children only once we KNOW the visitor is signed out (`isPending` has
 * cleared and there is no user). Hidden while the session is still loading.
 */
export function SignedOut({ children }: { children: ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  if (isPending || user) return null;
  return <>{children}</>;
}

/**
 * Client-side redirect to the sign-in route (TanStack `<Navigate>` — NOT a full
 * `window.location` reload). A hard navigation re-bootstraps the SPA and re-runs
 * session loading, which feels like a second "Loading…" on /login.
 *
 * Guard routes by waiting out `isPending` first (see `use-current-user`), then
 * render this.
 */
export function RedirectToSignIn({ to = SIGN_IN_PATH, next }: { to?: string; next?: string }) {
  // `next` is a separate prop, NOT a query string baked into `to`: <Navigate>
  // treats `to` as a route path and drops anything after the "?", so
  // `to="/login?next=/app/admin"` landed on /login with no search at all.
  //
  // Frozen on first render, because <Navigate> re-fires on every props
  // change and the caller is still mounted while the navigation settles: the
  // guard above would re-run with the location already changed to /login,
  // compute `next: undefined` for it, and navigate a second time -- wiping
  // the search params it had just set. Both failures are silent, and both
  // were only visible in a real browser.
  const [frozen] = useState({ to, next });
  return <Navigate to={frozen.to} search={frozen.next ? { next: frozen.next } : undefined} replace />;
}

/**
 * Minimal signed-in identity chip + sign-out. Restyle freely (see the
 * `design-ui` skill). Sign-out is only shown when auth is enabled (the
 * disabled-auth dev user has nothing to sign out of).
 */
export function UserButton() {
  const user = useCurrentUser();
  // Sign-out can take a moment (and can fail when deployed), so the control
  // shows it is working and cannot be fired twice.
  const [signingOut, setSigningOut] = useState(false);
  // Where sign-out lands depends on which surface you signed out FROM: the
  // admin console returns to its own login page, everything else to the
  // consumer root. Read here rather than passed in as a prop because this
  // button is rendered by shared chrome (<AuthSlot /> inside <AppShell />)
  // that has no idea which page it is decorating.
  const path = useRouterState({ select: (s) => s.location.pathname });
  if (!user) return null;
  const label = user.displayName ?? user.primaryEmail ?? "Account";
  return (
    <div className="flex items-center gap-2">
      {user.profileImageUrl ? (
        <img
          src={user.profileImageUrl}
          alt=""
          className="h-8 w-8 rounded-full object-cover"
        />
      ) : (
        <span className="grid h-8 w-8 place-items-center rounded-full bg-black/10 text-sm font-medium dark:bg-white/20">
          {label.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="text-sm font-medium">{label}</span>
      {authEnabled && (
        <button
          type="button"
          disabled={signingOut}
          onClick={() => {
            setSigningOut(true);
            // Success navigates away; on failure re-enable so it can be retried.
            void signOut(signOutDestinationFor(path)).catch(() => setSigningOut(false));
          }}
          className="cursor-pointer text-sm underline-offset-4 opacity-70 hover:underline disabled:cursor-wait disabled:no-underline"
        >
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
      )}
    </div>
  );
}
