import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { createChild } from "@/lib/server/children";
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

export const Route = createFileRoute("/onboard")({ component: Onboard });

function Onboard() {
  const { user, isPending } = useCurrentUserState();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [grade, setGrade] = useState(1);
  const [startBand, setStartBand] = useState<StartBand>("beginning");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (isPending) {
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
    setBusy(true);
    setError(null);
    try {
      const child = await createChild({ data: { name, grade, startBand } });
      writeActiveChildId(child.id);
      writeStoredActiveGrade(child.grade, child.id);
      await navigate({ to: "/app", search: { grade: child.grade } });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("saveFailed"));
    } finally {
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
              onChange={(e) => setName(e.target.value)}
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
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={busy || !name.trim()}>
            {busy ? t("creating") : t("openTimetable")}
          </Button>
        </form>
      </main>
    </AppShell>
  );
}
