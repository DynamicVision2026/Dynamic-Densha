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

type Search = { next?: string; add?: boolean };

export const Route = createFileRoute("/onboard")({
  component: Onboard,
  validateSearch: (s: Record<string, unknown>): Search => ({
    next: typeof s.next === "string" ? s.next : undefined,
    // ?add=1 is how a household that already has children reaches this form
    // deliberately. Without it there is no way to register a second child at
    // all: the skip-if-you-have-one behaviour below (right for a post-login
    // hop) would bounce a parent straight back out of the form they asked
    // for, which made the whole multi-child model unreachable.
    // Parsed loosely on purpose: TanStack hands this through as a string
    // from a typed <Link search={{ add: true }}> and as a number from a
    // hand-typed ?add=1, and the difference is not worth a bug.
    add: s.add === 1 || s.add === "1" || s.add === true || s.add === "true",
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
  // Distinguished from any other error so the tier refusal is assertable,
  // and so a future "…and here is what to do about it" can hang off it.
  const [quotaRefused, setQuotaRefused] = useState(false);
  // Synchronous, unlike `busy` -- a ref mutation is visible to a second
  // click's handler the instant it runs, even before React re-renders to
  // reflect the disabled button. Two click events on the same JS thread
  // are always handled one to completion before the next starts, so this
  // alone fully closes the same-tick double-tap window `busy` can miss.
  const submittingRef = useRef(false);
  // One key per form INSTANCE, not per submit: the duplicate-name prompt
  // sends the same submission twice (ask, then confirm), and a fresh key on
  // the second would defeat the idempotency it exists for -- a dropped
  // response to the confirm followed by a retry would create two children.
  const idempotencyKeyRef = useRef(crypto.randomUUID());

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
  const adding = search.add === true;
  const hasChildren = Boolean(childrenQ.data && childrenQ.data.length > 0) && !adding;
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

    submittingRef.current = true;
    setBusy(true);
    setError(null);
    setQuotaRefused(false);
    try {
      // The duplicate-name question is the SERVER's to ask now: a client-side
      // scan of childrenQ.data cannot see a sibling created seconds ago in
      // another tab, and this form's whole reason for existing is the race
      // where two submissions land at once. First attempt asks; a second,
      // deliberate tap carries confirmDuplicateName and goes through.
      const result = await createChild({
        data: {
          name,
          grade,
          startBand,
          idempotencyKey: idempotencyKeyRef.current,
          confirmDuplicateName: nameWarning,
        },
      });

      if ("error" in result) {
        if (result.error.code === "DUPLICATE_NAME") {
          setNameWarning(true);
        } else if (result.error.code === "QUOTA_EXCEEDED") {
          setQuotaRefused(true);
          setError(t("childQuotaReached"));
        } else {
          setError(t("saveFailed"));
        }
        submittingRef.current = false;
        setBusy(false);
        return;
      }

      const child = result.child;
      writeActiveChildId(child.id);
      writeStoredActiveGrade(child.grade, child.id);
      // Adding a sibling returns to the parent surface, which is where the
      // parent was and where the pass assignment lives; a first child opens
      // their own board.
      if (adding) await navigate({ to: "/app/parent", search: { child: child.id } });
      else if (dest === "/app") await navigate({ to: "/app/child/$childId", params: { childId: child.id }, search: { grade: child.grade } });
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
          {error ? (
            <p className="text-sm text-destructive" data-quota-error={quotaRefused || undefined}>
              {error}
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={busy || !name.trim()}>
            {busy ? t("creating") : nameWarning ? t("duplicateChildNameConfirm") : t("openTimetable")}
          </Button>
        </form>
      </main>
    </AppShell>
  );
}
