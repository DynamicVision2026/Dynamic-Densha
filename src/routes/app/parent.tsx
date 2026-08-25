import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { ParentReportView } from "@/components/parent-report";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { readActiveChildId, writeActiveChildId } from "@/lib/active-child";
import { resetActiveGradeToProfile } from "@/lib/active-grade";
import {
  confirmGradeRollover,
  dismissGradeRollover,
  listChildren,
  updateStartBand,
} from "@/lib/server/children";
import { ParentForwardView } from "@/components/parent-forward";
import { GradeRolloverCard } from "@/components/grade-rollover";
import { StartBandPicker } from "@/components/start-band-picker";
import type { StartBand } from "@/lib/grade-route";
import { requestInsight } from "@/lib/server/insights";
import { getParentOverview } from "@/lib/server/progress";
import { useI18n } from "@/lib/i18n/i18n";

type Search = { child?: string };
export const Route = createFileRoute("/app/parent")({
  component: ParentPage,
  validateSearch: (s: Record<string, unknown>): Search => ({
    child: typeof s.child === "string" ? s.child : undefined,
  }),
});

function ParentPage() {
  const { t } = useI18n();
  const search = Route.useSearch();
  const [childId, setChildId] = useState(search.child || readActiveChildId() || "");
  const childrenQ = useQuery({ queryKey: ["children"], queryFn: () => listChildren() });

  useEffect(() => {
    if (!childId && childrenQ.data?.[0]) {
      setChildId(childrenQ.data[0].id);
      writeActiveChildId(childrenQ.data[0].id);
    }
  }, [childId, childrenQ.data]);

  const overviewQ = useQuery({
    queryKey: ["overview", childId],
    queryFn: () => getParentOverview({ data: childId }),
    enabled: Boolean(childId),
  });

  const insight = useMutation({
    mutationFn: () => requestInsight({ data: childId }),
  });

  const rolloverMut = useMutation({
    mutationFn: () => confirmGradeRollover({ data: { childId } }),
    onSuccess: (out) => {
      if (out.ok) resetActiveGradeToProfile(out.grade, childId);
      void childrenQ.refetch();
      void overviewQ.refetch();
    },
  });

  const dismissMut = useMutation({
    mutationFn: () => dismissGradeRollover({ data: { childId } }),
    onSuccess: () => {
      void overviewQ.refetch();
    },
  });

  const bandMut = useMutation({
    mutationFn: (startBand: StartBand) => updateStartBand({ data: { childId, startBand } }),
    onSuccess: () => {
      void overviewQ.refetch();
    },
  });

  if (!childId || overviewQ.isLoading) {
    return (
      <AppShell>
        <div className="mx-auto max-w-[900px] px-5 py-12">
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </AppShell>
    );
  }

  const data = overviewQ.data;
  if (!data) return null;

  return (
    <AppShell childName={data.child.name} grade={data.child.grade}>
      <main data-parent-doc className="mx-auto max-w-[900px] px-5 py-8">
        <p className="text-xs tracking-[0.2em] text-fg-subtle">{t("parentPage")}</p>
        <h1 className="mt-1 font-display text-3xl">{t("parentTitle")}</h1>

        <div className="mt-6 flex flex-wrap gap-2">
          {childrenQ.data?.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`h-11 rounded-full border px-3 text-sm ${
                c.id === childId ? "border-fg bg-fg text-bg" : "border-border bg-surface"
              }`}
              onClick={() => {
                writeActiveChildId(c.id);
                setChildId(c.id);
              }}
            >
              {c.name}
            </button>
          ))}
        </div>

        {data.report ? <ParentReportView report={data.report} /> : null}

        {data.forward && data.route && data.plan && data.progress ? (
          <ParentForwardView
            forward={data.forward}
            route={data.route}
            plan={data.plan}
            progress={data.progress}
            arrival={data.arrival}
            history={data.history}
          />
        ) : null}

        <section className="mt-4 rounded-xl border border-border bg-surface p-5" data-parent-settings>
          <StartBandPicker
            value={(data.child as { startBand?: StartBand }).startBand ?? "beginning"}
            onChange={(band) => bandMut.mutate(band)}
            disabled={bandMut.isPending}
          />
        </section>

        <GradeRolloverCard
          grade={data.child.grade}
          canRollover={Boolean(data.canRollover)}
          aprilPrompt={Boolean(data.aprilPrompt)}
          pending={rolloverMut.isPending}
          onConfirm={() => rolloverMut.mutate()}
          onDismiss={() => dismissMut.mutate()}
        />

        <section className="mt-4 rounded-xl border border-border bg-surface p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-lg">{t("aiInsight")}</h2>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={insight.isPending}
              onClick={() => insight.mutate()}
            >
              {insight.isPending ? t("writingInsight") : t("askInsight")}
            </Button>
          </div>
          <p className="mt-2 text-xs text-fg-subtle">{t("insightHint")}</p>
          {insight.data?.ok ? (
            <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-fg">{insight.data.text}</p>
          ) : insight.data && !insight.data.ok ? (
            <p className="mt-4 text-sm text-fg-muted">{insight.data.error}</p>
          ) : (
            <p className="mt-4 text-sm text-fg-muted">{t("noInsight")}</p>
          )}
        </section>

        <section className="mt-4 rounded-xl border border-border bg-surface p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg">{t("recentStudy")}</h2>
            <Link
              to="/app/mistakes"
              search={{ child: childId }}
              className="text-sm text-fg-muted underline-offset-4 hover:underline"
            >
              {t("mistakes")}
            </Link>
          </div>
          <ul className="mt-3 divide-y divide-border">
            {data.recent.length === 0 ? (
              <li className="py-6 text-sm text-fg-muted">{t("noRecent")}</li>
            ) : (
              data.recent.map((ev, i) => (
                <li key={`${ev.created_at}-${i}`} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="font-display text-lg">{ev.kanji}</span>
                  <span className="text-fg-muted">{ev.kind}</span>
                  <span className={ev.correct ? "text-status-perfect" : "text-status-lost"}>
                    {ev.correct ? t("correct") : t("wrong")}
                  </span>
                </li>
              ))
            )}
          </ul>
        </section>

        <p className="mt-10 text-center text-[11px] leading-relaxed text-fg-subtle" data-parent-licenses>
          {t("shapeLicense")}
          <br />
          {t("audioLicense")}
        </p>
      </main>
    </AppShell>
  );
}
