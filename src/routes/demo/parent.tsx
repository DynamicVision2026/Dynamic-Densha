import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { ParentReportView } from "@/components/parent-report";
import { ParentForwardView } from "@/components/parent-forward";
import { GradeRolloverCard } from "@/components/grade-rollover";
import { StartBandPicker } from "@/components/start-band-picker";
import { Button } from "@/components/ui/button";
import { resetActiveGradeToProfile } from "@/lib/active-grade";
import {
  DEMO_CHILD,
  getDemoOverview,
  setDemoStartBand,
  setDemoRollover,
  setDemoRolloverDismiss,
} from "@/lib/demo-progress";
import { demoStartBand } from "@/lib/demo-route";
import type { StartBand } from "@/lib/grade-route";
import { useI18n } from "@/lib/i18n/i18n";

export const Route = createFileRoute("/demo/parent")({
  component: DemoParent,
  ssr: false,
});

function DemoParent() {
  const { t } = useI18n();
  const [band, setBand] = useState<StartBand>(demoStartBand);
  const [, setTick] = useState(0);
  const data = getDemoOverview();
  const [insight, setInsight] = useState<string | null>(null);

  const sample = t("demoInsight", {
    name: t("demoName"),
    n: DEMO_CHILD.grade,
    total: data.total,
    perfect: data.perfect,
    lost: data.counts.lost,
    fix: data.counts.fix,
  });

  return (
    <AppShell childName={t("demoName")} grade={DEMO_CHILD.grade}>
      <main className="mx-auto max-w-3xl px-5 py-8">
        <p className="text-xs tracking-[0.2em] text-fg-subtle">{t("parentPage")}</p>
        <h1 className="mt-1 font-display text-3xl">{t("parentTitle")}</h1>
        <p className="mt-2 text-sm text-fg-muted">{t("demoBanner")}</p>

        <GradeRolloverCard
          grade={DEMO_CHILD.grade}
          canRollover={Boolean(data.canRollover)}
          aprilPrompt={Boolean(data.aprilPrompt)}
          onConfirm={() => {
            const out = setDemoRollover();
            if (out.ok) resetActiveGradeToProfile(out.grade, DEMO_CHILD.id);
            setBand("beginning");
            setTick((n) => n + 1);
          }}
          onDismiss={() => {
            setDemoRolloverDismiss();
            setTick((n) => n + 1);
          }}
        />

        <section className="mt-4 rounded-xl border border-border bg-surface p-5">
          <StartBandPicker
            value={band}
            onChange={(next) => {
              setDemoStartBand(next);
              setBand(next);
            }}
          />
        </section>

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

        <ParentReportView report={data.report} homeTo="/demo" />

        <section className="mt-4 rounded-xl border border-border bg-surface p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-lg">{t("aiInsight")}</h2>
            <Button type="button" size="sm" variant="outline" onClick={() => setInsight(sample)}>
              {t("askInsight")}
            </Button>
          </div>
          <p className="mt-2 text-xs text-fg-subtle">{t("insightHint")}</p>
          {insight ? (
            <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-fg">{insight}</p>
          ) : (
            <p className="mt-4 text-sm text-fg-muted">{t("noInsight")}</p>
          )}
        </section>

        <section className="mt-4 rounded-xl border border-border bg-surface p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg">{t("recentStudy")}</h2>
            <Link to="/demo/mistakes" className="text-sm text-fg-muted underline-offset-4 hover:underline">
              {t("mistakes")}
            </Link>
          </div>
          <ul className="mt-3 divide-y divide-border">
            {data.recent.length === 0 ? (
              <li className="py-6 text-sm text-fg-muted">{t("noRecent")}</li>
            ) : (
              data.recent.slice(0, 8).map((ev, i) => (
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

        <p className="mt-10 text-center text-[11px] leading-relaxed text-fg-subtle">
          {t("shapeLicense")}
          <br />
          {t("audioLicense")}
        </p>
      </main>
    </AppShell>
  );
}
