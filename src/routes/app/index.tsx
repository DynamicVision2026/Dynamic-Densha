import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { EchoQueue } from "@/components/echo-queue";
import { GradeSwitcher } from "@/components/grade-switcher";
import { KanjiSearch } from "@/components/kanji-search";
import { StatusLegend } from "@/components/status-legend";
import { TrainTrack } from "@/components/train-track";
import { WeekPeekCard } from "@/components/week-peek-card";
import { DepartureBoardView } from "@/components/departure-board";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { readActiveChildId, writeActiveChildId } from "@/lib/active-child";
import { resolveActiveGrade, usePersistActiveGrade } from "@/lib/active-grade";
import { gradeSearchFrom } from "@/lib/grade-nav";
import { listChildren } from "@/lib/server/children";
import { getHomeState } from "@/lib/server/progress";
import { useI18n } from "@/lib/i18n/i18n";
import type { Grade } from "@/data/kyoiku";

export const Route = createFileRoute("/app/")({
  component: AppHome,
  validateSearch: gradeSearchFrom,
});

function AppHome() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [mode, setMode] = useState<"play" | "look">("play");
  const [childId, setChildId] = useState<string | null>(null);

  const childrenQ = useQuery({
    queryKey: ["children"],
    queryFn: () => listChildren(),
  });

  useEffect(() => {
    if (!childrenQ.data) return;
    if (childrenQ.data.length === 0) {
      void navigate({ to: "/onboard" });
      return;
    }
    const stored = readActiveChildId();
    const next =
      (stored && childrenQ.data.some((c) => c.id === stored) && stored) ||
      childrenQ.data[0]!.id;
    setChildId(next);
    writeActiveChildId(next);
  }, [childrenQ.data, navigate]);

  const current = useMemo(
    () => childrenQ.data?.find((c) => c.id === childId),
    [childrenQ.data, childId],
  );
  const childGrade = (current?.grade ?? 1) as Grade;
  const viewGrade = resolveActiveGrade({
    urlGrade: search.grade,
    profileGrade: childGrade,
    childId,
  });
  usePersistActiveGrade(viewGrade, childId);
  useEffect(() => {
    if (childId && search.grade == null) {
      void navigate({ to: "/app", search: { grade: viewGrade }, replace: true });
    }
  }, [childId, search.grade, viewGrade, navigate]);

  const homeQ = useQuery({
    queryKey: ["home", childId, viewGrade],
    queryFn: () => getHomeState({ data: { childId: childId!, grade: viewGrade } }),
    enabled: Boolean(childId),
  });

  if (childrenQ.isLoading || (childId && homeQ.isLoading)) {
    return (
      <AppShell>
        <div className="mx-auto max-w-5xl px-4 py-10">
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </AppShell>
    );
  }

  const home = homeQ.data;

  return (
    <AppShell
      childName={home?.child.name ?? current?.name}
      grade={home?.child.grade ?? current?.grade}
      mode={mode}
      onMode={setMode}
    >
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs tracking-[0.2em] text-fg-subtle">{t("schedule")}</p>
            <h1 className="mt-1 font-display text-3xl">
              {t("timetableGrade", { n: viewGrade })}
            </h1>
            <p className="mt-1 max-w-lg text-sm text-fg-subtle">{t("timetableAllGrades")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {childrenQ.data?.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  writeActiveChildId(c.id);
                  setChildId(c.id);
                  const lens = resolveActiveGrade({
                    profileGrade: c.grade as Grade,
                    childId: c.id,
                  });
                  void navigate({ to: "/app", search: { grade: lens } });
                }}
                className={`h-9 rounded-full border px-3 text-sm ${
                  c.id === childId ? "border-fg bg-fg text-bg" : "border-border bg-surface"
                }`}
              >
                {c.name}
              </button>
            ))}
            <Button type="button" variant="ghost" size="sm" asChild>
              <Link to="/onboard">{t("addChild")}</Link>
            </Button>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <GradeSwitcher value={viewGrade} hrefBase="/app" childId={childId ?? undefined} />
          <KanjiSearch hrefBase="/app" />
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-surface px-5 py-4">
          <p className="text-sm text-fg-muted">
            {t("statusPerfect")}{" "}
            <span className="font-display text-xl tabular-nums text-fg">
              {home?.perfect ?? 0}
            </span>
            <span className="text-fg-subtle"> / {home?.total ?? 0}</span>
          </p>
          <StatusLegend compact />
        </div>

        {home?.echoQueue?.length ? (
          <EchoQueue
            rows={home.echoQueue}
            hrefBase="/app"
            childId={childId ?? undefined}
            mode={mode}
          />
        ) : null}

        {home?.board ? (
          <DepartureBoardView
            board={home.board}
            hrefBase="/app"
            grade={viewGrade}
            childId={childId ?? undefined}
            mode={mode}
          />
        ) : null}

        {home?.peek ? (
          <WeekPeekCard peek={home.peek} hrefBase="/app" grade={viewGrade} />
        ) : null}

        {home && home.seenToday >= home.maxNew ? (
          <p className="mt-4 text-sm text-fg-muted">{t("newPerDaySoft")}</p>
        ) : null}

        <div className="mt-10 space-y-10">
          {home?.trains.map((train) => (
            <TrainTrack
              key={train.id}
              train={train}
              childId={childId!}
              mode={mode}
              grade={viewGrade}
            />
          ))}
        </div>

        <p className="mt-10 text-center text-sm text-fg-subtle">
          {mode === "play" ? t("playHint") : t("lookHint")}
        </p>
      </main>
    </AppShell>
  );
}
