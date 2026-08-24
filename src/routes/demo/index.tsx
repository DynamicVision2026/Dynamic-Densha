import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { GradeSwitcher } from "@/components/grade-switcher";
import { KanjiSearch } from "@/components/kanji-search";
import { LineStrip } from "@/components/line-strip";
import { StatusLegend } from "@/components/status-legend";
import { TrainTrack } from "@/components/train-track";
import { Button } from "@/components/ui/button";
import { EchoQueue } from "@/components/echo-queue";
import { WatchDemoButton } from "@/components/auto-demo";
import { DEMO_CHILD, getDemoHome } from "@/lib/demo-progress";
import { resolveActiveGrade, usePersistActiveGrade } from "@/lib/active-grade";
import { gradeSearchFrom } from "@/lib/grade-nav";
import { useI18n } from "@/lib/i18n/i18n";
import { lineStripFor } from "@/lib/lines";
import { WeekPeekCard } from "@/components/week-peek-card";
import { DepartureBoardView } from "@/components/departure-board";

export const Route = createFileRoute("/demo/")({
  component: DemoHome,
  ssr: false,
  validateSearch: gradeSearchFrom,
});

function DemoHome() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const viewGrade = resolveActiveGrade({
    urlGrade: search.grade,
    profileGrade: DEMO_CHILD.grade,
  });
  usePersistActiveGrade(viewGrade);
  useEffect(() => {
    if (search.grade == null) {
      void navigate({ to: "/demo", search: { grade: viewGrade }, replace: true });
    }
  }, [search.grade, viewGrade, navigate]);
  const [mode, setMode] = useState<"play" | "look">("play");
  const home = getDemoHome(viewGrade);
  const kiLine = lineStripFor("林", viewGrade);

  return (
    <AppShell childName={t("demoName")} grade={DEMO_CHILD.grade} mode={mode} onMode={setMode}>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs tracking-[0.2em] text-fg-subtle">{t("schedule")}</p>
            <h1 className="mt-1 font-display text-3xl">
              {t("timetableGrade", { n: viewGrade })}
            </h1>
            <p className="mt-2 max-w-lg text-sm text-fg-muted">{t("demoBanner")}</p>
            <p className="mt-1 max-w-lg text-sm text-fg-subtle">{t("timetableAllGrades")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <WatchDemoButton variant="outline" />
            <Button type="button" asChild>
              <Link to="/demo/parent">{t("parent")}</Link>
            </Button>
            <Button type="button" variant="outline" asChild>
              <Link to="/login">{t("saveForReal")}</Link>
            </Button>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <GradeSwitcher value={viewGrade} hrefBase="/demo" />
          <KanjiSearch hrefBase="/demo" />
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-surface px-5 py-4">
          <p className="text-sm text-fg-muted">
            {t("statusPerfect")}{" "}
            <span className="font-display text-xl tabular-nums text-fg">{home.perfect}</span>
            <span className="text-fg-subtle"> / {home.total}</span>
          </p>
          <StatusLegend compact />
        </div>

        {viewGrade === DEMO_CHILD.grade && home.echoQueue.length > 0 ? (
          <EchoQueue rows={home.echoQueue} hrefBase="/demo" />
        ) : null}

        {viewGrade === DEMO_CHILD.grade && home.board ? (
          <DepartureBoardView board={home.board} hrefBase="/demo" grade={viewGrade} />
        ) : null}

        {home.peek ? (
          <WeekPeekCard peek={home.peek} hrefBase="/demo" grade={viewGrade} />
        ) : null}

        {viewGrade === 1 ? (
          <div className="mt-4 rounded-lg border border-border bg-surface px-5 py-4">
            <p className="text-xs tracking-[0.2em] text-fg-subtle">{t("demoShapeSample")}</p>
            <p className="mt-1 text-sm text-fg-muted">{t("demoShapeHint")}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(
                [
                  { char: "王", labelKey: "demoShapeStroke" as const },
                  { char: "林", labelKey: "demoShapeParts" as const },
                  { char: "花", labelKey: "demoShapeParts" as const },
                  { char: "生", labelKey: "linePhonetic" as const },
                ] as const
              ).map((row) => (
                <Link
                  key={row.char}
                  to="/demo/kanji/$char"
                  params={{ char: row.char }}
                  search={{ grade: viewGrade }}
                  data-tour={`sample-${row.char}`}
                  className="inline-flex h-11 items-center gap-2 rounded-md border border-border bg-bg px-3 font-display text-lg text-fg hover:bg-bg-warm"
                >
                  <span>{row.char}</span>
                  <span className="font-sans text-xs text-fg-subtle">{t(row.labelKey)}</span>
                </Link>
              ))}
            </div>
          </div>
        ) : null}

        {viewGrade === 1 ? (
          <div className="mt-4 rounded-lg border border-border bg-surface px-5 py-4">
            <p className="text-xs tracking-[0.2em] text-fg-subtle">{t("workshopKicker")}</p>
            <p className="mt-1 font-display text-lg">{t("workshopTitle")}</p>
            <p className="mt-1 text-sm text-fg-muted">{t("workshopLead")}</p>
            <Link
              to="/demo/workshop"
              search={{ grade: viewGrade }}
              data-tour="open-workshop"
              className="mt-3 inline-flex h-11 items-center rounded-md bg-fg px-4 text-sm font-medium text-bg"
            >
              {t("workshopTry")}
            </Link>
          </div>
        ) : null}

        {viewGrade === 1 && kiLine ? (
          <div className="mt-4">
            <LineStrip view={kiLine} />
          </div>
        ) : null}

        {home.seenToday >= home.maxNew ? (
          <p className="mt-4 text-sm text-fg-muted">{t("newPerDaySoft")}</p>
        ) : null}

        <div className="mt-10 space-y-10">
          {home.trains.map((train) => (
            <TrainTrack
              key={train.id}
              train={train}
              childId={DEMO_CHILD.id}
              mode={mode}
              hrefBase="/demo"
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
