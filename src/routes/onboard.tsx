import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { createChild, listChildren } from "@/lib/server/children";
import { getAdminStatus } from "@/lib/server/admin";
import { writeActiveChildId } from "@/lib/active-child";
import { writeStoredActiveGrade } from "@/lib/active-grade";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/lib/i18n/i18n";
import { StartBandPicker } from "@/components/start-band-picker";
import type { StartBand } from "@/lib/grade-route";
import { resolvePostAuthNext } from "@/lib/post-auth-redirect";

type Search = { next?: string };

export const Route = createFileRoute("/onboard")({
  component: Onboard,
  validateSearch: (s: Record<string, unknown>): Search => ({
    next: typeof s.next === "string" ? s.next : undefined,
  }),
});

function Onboard() {
  const { user, isPending } = useCurrentUserState();
  const { t } = useI18n();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const dest = resolvePostAuthNext(search.next);
  const [name, setName] = useState("");
  const [grade, setGrade] = useState(1);
  const [startBand, setStartBand] = useState<StartBand>("beginning");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [nameWarning, setNameWarning] = useState(false);
  // Synchronous, unlike `busy` -- a ref mutation is visible to a second
  // click's handler the instant it runs, even before React re-renders to
  // reflect the disabled button. Two click events on the same JS thread
  // are always handled one to completion before the next starts, so this
  // alone fully closes the same-tick double-tap window `busy` can miss.
  const submittingRef = useRef(false);

  // /onboard is reachable two ways: /app's own zero-children redirect (no
  // `next`, always continues to /app once a child exists -- unchanged), and
  // now the post-login hop every login.tsx sign-in/sign-up goes through
  // (always carrying `next`, e.g. back to /subscribe). A visitor who
  // already has a child skips the create-child form entirely and goes
  // straight to `dest` -- this route only exists to guarantee a household
  // has at least one child before continuing, not to force a redundant
  // second child on a returning parent.
  const childrenQ = useQuery({
    queryKey: ["children"],
    queryFn: () => listChildren(),
    enabled: Boolean(user),
  });
  const hasChildren = Boolean(childrenQ.data && childrenQ.data.length > 0);
  const childless = Boolean(childrenQ.data && childrenQ.data.length === 0);

  // Every post-login destination hops through here (see login.tsx), and this
  // form is what a childless account gets. That is right for a parent and
  // wrong for an admin, who has no child and never will -- without this they
  // are asked to register one before they can reach anything. Only asked
  // when we are about to show the form, so a normal family never pays for
  // the query.
  const adminQ = useQuery({
    queryKey: ["admin-status"],
    queryFn: () => getAdminStatus(),
    enabled: Boolean(user) && childless,
    retry: false,
  });
  const isAdmin = adminQ.data?.isAdmin === true;
  const adminUndecided = childless && adminQ.isLoading;

  useEffect(() => {
    if (isAdmin) {
      void navigate({ to: "/app/admin" });
      return;
    }
    if (!hasChildren) return;
    if (dest === "/app") void navigate({ to: "/app" });
    else window.location.href = dest;
  }, [isAdmin, hasChildren, dest, navigate]);

  if (isPending || (user && childrenQ.isLoading) || hasChildren || adminUndecided || isAdmin) {
    return (
      <AppShell>
        <div className="mx-auto max-w-md px-5 py-16">
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      </AppShell>
    );
  }
  if (!user) return <RedirectToSignIn />;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submittingRef.current) return;

    const trimmed = name.trim();
    // Soft warning, not a hard block -- a household normally has zero
    // children on this route (it's skipped once any exist), so this only
    // ever fires on the double-tap race this whole change set exists to
    // close: two near-simultaneous submits, the first already landed by
    // the time childrenQ refetches, the second still mid-flight. First
    // click surfaces the warning and stops; a second, deliberate click
    // continues past it.
    const dup = childrenQ.data?.some((c) => c.name === trimmed);
    if (dup && !nameWarning) {
      setNameWarning(true);
      return;
    }

    submittingRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const child = await createChild({
        data: { name, grade, startBand, idempotencyKey: crypto.randomUUID() },
      });
      writeActiveChildId(child.id);
      writeStoredActiveGrade(child.grade, child.id);
      if (dest === "/app") await navigate({ to: "/app", search: { grade: child.grade } });
      else window.location.href = dest;
    } catch (err) {
      setError(err instanceof Error ? err.message : t("saveFailed"));
      submittingRef.current = false;
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <main className="mx-auto max-w-md px-5 py-12">
        <p className="text-xs tracking-[0.2em] text-fg-subtle">{t("onboardKicker")}</p>
        <h1 className="mt-2 font-display text-3xl">{t("onboardTitle")}</h1>
        <p className="mt-2 text-sm leading-6 text-fg-muted">{t("onboardLead")}</p>
        <form onSubmit={onSubmit} className="mt-8 space-y-5 rounded-xl border border-border bg-surface p-6">
          <div className="space-y-1.5">
            <Label htmlFor="child-name">{t("nickname")}</Label>
            <Input
              id="child-name"
              required
              maxLength={20}
              placeholder={t("nicknamePh")}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNameWarning(false);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("grade")}</Label>
            <div className="grid grid-cols-6 gap-1.5">
              {[1, 2, 3, 4, 5, 6].map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGrade(g)}
                  className={`h-11 rounded-md border text-sm ${
                    grade === g ? "border-fg bg-fg text-bg" : "border-border bg-bg"
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
          <StartBandPicker value={startBand} onChange={setStartBand} />
          {nameWarning ? (
            <p className="text-sm text-fg-muted" data-duplicate-name-warning>
              {t("duplicateChildNameWarning", { name: name.trim() })}
            </p>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={busy || !name.trim()}>
            {busy ? t("creating") : nameWarning ? t("duplicateChildNameConfirm") : t("openTimetable")}
          </Button>
        </form>
      </main>
    </AppShell>
  );
}
