import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { ParentHub, SiblingRail } from "@/components/parent-shell";
import { MasteryHero } from "@/components/mastery-hero";
import { WeeklyRhythm } from "@/components/weekly-rhythm";
import { ParentReportView } from "@/components/parent-report";
import { ParentForwardView } from "@/components/parent-forward";
import { GradeRolloverCard } from "@/components/grade-rollover";
import { TrialBanner } from "@/components/trial-banner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { writeActiveChildId } from "@/lib/active-child";
import { resetActiveGradeToProfile } from "@/lib/active-grade";
import { confirmGradeRollover, dismissGradeRollover, listChildren } from "@/lib/server/children";
import { requestInsight } from "@/lib/server/insights";
import { getParentOverview } from "@/lib/server/progress";
import { useI18n } from "@/lib/i18n/i18n";

type Search = { already?: "active" };

export const Route = createFileRoute("/app/parent/report/$childId")({
  component: ParentReport,
  validateSearch: (s: Record<string, unknown>): Search => ({
    already: s.already === "active" ? "active" : undefined,
  }),
});

/**
 * 学習レポート -- daily supervision for ONE child, and nothing administrative.
 *
 * The child is in the path, so a parent of two can keep both open, send one
 * to the other parent, and land on the same child they left. That is the same
 * move the child surface made; running a second mechanism here would be how
 * the two drift.
 */
function ParentReport() {
  const { t } = useI18n();
  const { childId } = Route.useParams();
  const search = Route.useSearch();
  const qc = useQueryClient();

  const childrenQ = useQuery({ queryKey: ["children"], queryFn: () => listChildren() });
  const overviewQ = useQuery({
    queryKey: ["overview", childId],
    queryFn: () => getParentOverview({ data: childId }),
  });

  // The hint follows the URL, so the next bare /app/parent lands where this
  // visit did. Never the other way round.
  useEffect(() => {
    if (childrenQ.data?.some((c) => c.id === childId)) writeActiveChildId(childId);
  }, [childrenQ.data, childId]);

  // Warm ONE sibling at idle: the next most likely tap, not the whole
  // household. getParentOverview is the heaviest response in the app, and
  // prefetching three of them on a phone would cost a parent real bytes to
  // save a tap they may never make. Idle, never hover -- there is no hover on
  // the device this page is read on.
  useEffect(() => {
    const others = (childrenQ.data ?? []).filter((c) => c.id !== childId);
    const next = others[0];
    if (!next) return;
    const warm = () => {
      void qc.prefetchQuery({
        queryKey: ["overview", next.id],
        queryFn: () => getParentOverview({ data: next.id }),
        staleTime: 30_000,
      });
    };
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number })
      .requestIdleCallback;
    if (ric) {
      const handle = ric(warm, { timeout: 3000 });
      const cancel = (window as unknown as { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback;
      return () => cancel?.(handle);
    }
    const timer = window.setTimeout(warm, 1200);
    return () => window.clearTimeout(timer);
  }, [childrenQ.data, childId, qc]);

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
    onSuccess: () => void overviewQ.refetch(),
  });
  const insight = useMutation({ mutationFn: () => requestInsight({ data: childId }) });

  const siblings = (childrenQ.data ?? []).map((c) => ({ id: c.id, name: c.name, grade: c.grade }));
  const data = overviewQ.data;

  return (
    <ParentHub tab="report" childId={childId} childName={data?.child.name} grade={data?.child.grade}>
      {search.already === "active" ? (
        <p className="mt-4 rounded-xl border border-border bg-surface px-4 py-3 text-sm text-fg-muted">
          {t("alreadyActiveNotice")}
        </p>
      ) : null}

      <SiblingRail childrenList={siblings} currentId={childId} />

      {!data ? (
        <div className="mt-5">
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : (
        <>
          <MasteryHero
            childId={childId}
            grade={data.child.grade}
            cumulativePerfect={data.stampCount}
            gradePerfect={data.report?.teachReadyPerfect ?? 0}
            gradeTotal={data.report?.teachReadyTotal ?? 0}
          />

          <WeeklyRhythm
            daysRidden={data.weekRhythm.daysRidden}
            newMet={data.weekRhythm.newMet}
            reviewDue={data.weekRhythm.reviewDue}
          />

          <div className="mt-4">
            <TrialBanner banner={data.trialBanner} />
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

          <GradeRolloverCard
            grade={data.child.grade}
            canRollover={Boolean(data.canRollover)}
            aprilPrompt={Boolean(data.aprilPrompt)}
            pending={rolloverMut.isPending}
            onConfirm={() => rolloverMut.mutate()}
            onDismiss={() => dismissMut.mutate()}
          />

          <section className="mt-4 rounded-xl border border-border bg-surface p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-lg">{t("recentStudy")}</h2>
              <Link
                to="/app/child/$childId/mistakes"
                params={{ childId }}
                className="inline-flex min-h-11 items-center text-sm text-fg-muted underline-offset-4 hover:underline"
              >
                {t("mistakes")}
              </Link>
            </div>
            <ul className="mt-3 divide-y divide-border">
              {data.recent.length === 0 ? (
                <li className="py-6 text-sm text-fg-muted">{t("noRecent")}</li>
              ) : (
                data.recent.map((ev, i) => (
                  <li key={`${ev.created_at}-${i}`} className="flex items-center justify-between gap-3 py-2.5 text-sm">
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
        </>
      )}
    </ParentHub>
  );
}
