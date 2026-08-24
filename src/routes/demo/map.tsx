import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppShell } from "@/components/app-shell";
import { ConfusableList } from "@/components/confusable-list";
import { GradeSwitcher } from "@/components/grade-switcher";
import { RouteMap } from "@/components/route-map";
import { DEMO_CHILD, getDemoMap } from "@/lib/demo-progress";
import { resolveActiveGrade, usePersistActiveGrade } from "@/lib/active-grade";
import { mapSearchFrom } from "@/lib/grade-nav";
import { pairsForGrade } from "@/lib/confusable";
import { useI18n } from "@/lib/i18n/i18n";

export const Route = createFileRoute("/demo/map")({
  component: DemoMap,
  ssr: false,
  validateSearch: mapSearchFrom,
});

function DemoMap() {
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
      void navigate({
        to: "/demo/map",
        search: { grade: viewGrade, ...(search.line ? { line: search.line } : {}) },
        replace: true,
      });
    }
  }, [search.grade, search.line, viewGrade, navigate]);
  const data = getDemoMap(viewGrade);
  const pairs = pairsForGrade(viewGrade);

  return (
    <AppShell childName={t("demoName")} grade={DEMO_CHILD.grade}>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <p className="text-xs tracking-[0.2em] text-fg-subtle">{t("mapKicker")}</p>
        <h1 className="mt-1 font-display text-3xl" data-tour="map-title">{t("mapTitle")}</h1>
        <p className="mt-2 max-w-lg text-sm text-fg-muted">{t("mapLead")}</p>
        <div className="mt-6">
          <GradeSwitcher
            value={viewGrade}
            hrefBase="/demo/map"
            search={search.line ? { line: search.line } : undefined}
          />
        </div>
        <div className="mt-4 rounded-lg border border-border bg-surface px-4 py-4">
          <p className="text-xs tracking-[0.2em] text-fg-subtle">{t("workshopKicker")}</p>
          <p className="mt-1 font-display text-lg">{t("workshopTitle")}</p>
          <p className="mt-1 text-sm text-fg-muted">{t("workshopLead")}</p>
          <Link
            to="/demo/workshop"
            search={{ grade: viewGrade }}
            className="mt-3 inline-flex h-11 items-center rounded-md border border-border bg-bg px-4 text-sm font-medium hover:bg-bg-warm"
          >
            {t("workshopTry")}
          </Link>
        </div>
        <div className="mt-6">
          <RouteMap
            lines={data.lines}
            hrefBase="/demo"
            activeGrade={viewGrade}
            focusLineId={search.line}
          />
        </div>
        <div className="mt-6">
          <ConfusableList pairs={pairs} hrefBase="/demo" childGrade={viewGrade} />
        </div>
      </main>
    </AppShell>
  );
}
