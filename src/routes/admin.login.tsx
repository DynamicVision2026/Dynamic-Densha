import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { authEnabled, signInWithGoogle, signOut } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getAdminStatus } from "@/lib/server/admin";
import { ADMIN_LOGIN_PATH, resolveAdminNext } from "@/lib/admin-routes";

type Search = { next?: string; error?: "oauth" };

export const Route = createFileRoute("/admin/login")({
  component: AdminLogin,
  validateSearch: (s: Record<string, unknown>): Search => ({
    next: typeof s.next === "string" ? s.next : undefined,
    error: s.error === "oauth" ? "oauth" : undefined,
  }),
});

/**
 * The admin console's own front door, with no consumer app in it.
 *
 * /login is a parent's page: it offers sign-up, it talks about starting a
 * child's train, and every sign-in it performs hops through /onboard, whose
 * job is to make sure a household has a child before continuing. An operator
 * signing into the console is none of those things, and routing them through
 * that door is how a failed admin check kept coming back as "register your
 * child". So this route shares the session and the Google provider with the
 * consumer app and nothing else -- no AppShell, no train chrome, no
 * onboarding hop, no email/password sign-up.
 *
 * It is also the surface that decides what happens after OAuth returns:
 * Google comes back HERE (callbackURL below), the admin check runs, and an
 * admin is forwarded to /app/admin while anyone else is told plainly that
 * they lack the permission and offered a way out of the session. Deciding it
 * here rather than at /app/admin means a non-admin who signed in through the
 * console never touches the consumer app at all.
 *
 * The Japanese here is hardcoded rather than routed through i18n: this is an
 * internal tool with one operator, and the four-locale parity the message
 * catalogue enforces (src/lib/i18n) buys nothing for a page no customer sees.
 * Same call as src/lib/commerce-copy.ts.
 */
function AdminLogin() {
  const { user, isPending } = useCurrentUserState();
  const search = Route.useSearch();
  const dest = resolveAdminNext(search.next);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const adminQ = useQuery({
    queryKey: ["admin-status"],
    queryFn: () => getAdminStatus(),
    enabled: Boolean(user),
    retry: false,
  });
  const isAdmin = adminQ.data?.isAdmin === true;
  // A signed-in visitor whose admin check has not answered yet is neither
  // "sign in" nor "forbidden" -- showing either would be a lie for the
  // duration of one round trip.
  const undecided = Boolean(user) && adminQ.isLoading;

  useEffect(() => {
    if (isAdmin) window.location.href = dest;
  }, [isAdmin, dest]);

  // Google returns to this same page rather than to `dest` directly, so the
  // admin check above runs before anything in /app renders. The destination
  // rides along in the URL because the OAuth round trip is a full-page
  // navigation -- component state does not survive it.
  const callbackURL = `${ADMIN_LOGIN_PATH}?next=${encodeURIComponent(dest)}`;
  const errorCallbackURL = `${ADMIN_LOGIN_PATH}?error=oauth&next=${encodeURIComponent(dest)}`;

  async function onGoogleClick() {
    setError(null);
    setBusy(true);
    try {
      await signInWithGoogle({ callbackURL, errorCallbackURL });
    } catch (err) {
      // A redirect that never happens (popup blocked, provider error before
      // navigation) leaves the page sitting there; say so instead.
      setError(err instanceof Error ? err.message : "ログインに失敗しました。");
      setBusy(false);
    }
  }

  function onSignOutClick() {
    setSigningOut(true);
    // Back to this page, not to the consumer root: whoever is here is trying
    // to reach the console, usually with a different account.
    void signOut(ADMIN_LOGIN_PATH).catch(() => setSigningOut(false));
  }

  if (isPending || undecided || isAdmin) {
    return (
      <Console>
        <p className="text-sm text-fg-muted">確認しています…</p>
      </Console>
    );
  }

  if (user) return <Forbidden onSignOut={onSignOutClick} signingOut={signingOut} email={user.primaryEmail ?? null} />;

  return (
    <Console>
      {search.error === "oauth" ? (
        <p
          data-admin-login-error
          className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          ログインが完了しませんでした。もう一度お試しください。
        </p>
      ) : null}
      <button
        type="button"
        data-admin-google
        onClick={onGoogleClick}
        disabled={busy || !authEnabled}
        className="inline-flex h-12 w-full items-center justify-center rounded-lg border border-border bg-bg text-sm font-medium disabled:opacity-60"
      >
        {busy ? "接続しています…" : "Google アカウントでログイン"}
      </button>
      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      <p className="mt-6 text-xs leading-5 text-fg-subtle">
        このページは社内向けの管理コンソールです。一般のお客さま向けの画面ではありません。
      </p>
    </Console>
  );
}

/**
 * Shown when the session is real but the account is not on the admin list.
 * Deliberately a dead end with one door: signing out. Offering "go to the
 * app" here would drop them into the consumer flow they never asked for.
 */
function Forbidden({
  onSignOut,
  signingOut,
  email,
}: {
  onSignOut: () => void;
  signingOut: boolean;
  email: string | null;
}) {
  return (
    <Console>
      <p data-admin-login-forbidden className="font-display text-lg">
        管理者権限がありません
      </p>
      <p className="mt-2 text-sm leading-6 text-fg-muted">
        {email ? `${email} ` : ""}
        このアカウントには管理コンソールへのアクセス権がありません。別のアカウントでログインしてください。
      </p>
      <button
        type="button"
        data-admin-signout
        onClick={onSignOut}
        disabled={signingOut}
        className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-lg border border-border bg-bg text-sm disabled:opacity-60"
      >
        {signingOut ? "ログアウトしています…" : "ログアウト"}
      </button>
    </Console>
  );
}

/** The portal's frame: a plain card on a plain ground. No brand chrome, no もどる, no train. */
function Console({ children }: { children: React.ReactNode }) {
  return (
    <main data-admin-portal className="grid min-h-dvh place-items-center bg-bg px-5 py-10">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-soft">
        <p className="text-xs tracking-[0.2em] text-fg-subtle">Beyond Culture 管理コンソール</p>
        <h1 className="mt-2 font-display text-2xl">漢字でんしゃ 管理者ログイン</h1>
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}
