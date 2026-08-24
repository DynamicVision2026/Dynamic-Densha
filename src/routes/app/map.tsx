import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { ConfusableList } from "@/components/confusable-list";
import { GradeSwitcher } from "@/components/grade-switcher";
import { RouteMap } from "@/components/route-map";
import { Skeleton } from "@/components/ui/skeleton";
import { readActiveChildId, writeActiveChildId } from "@/lib/active-child";
import { resolveActiveGrade, usePersistActiveGrade } from "@/lib/active-grade";
import { pairsForGrade } from "@/lib/confusable";
import { listChildren } from "@/lib/server/children";
import { getMapState } from "@/lib/server/progress";
import { mapSearchFrom } from "@/lib/grade-nav";
import { useI18n } from "@/lib/i18n/i18n";
import type { Grade } from "@/data/kyoiku";

export const Route = createFileRoute("/app/map")({
  component: AppMap,
  validateSearch: mapSearchFrom,
});

function AppMap() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const search = Route.useSearch();
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
      void navigate({
        to: "/app/map",
        search: { grade: viewGrade, ...(search.line ? { line: search.line } : {}) },
        replace: true,
      });
    }
  }, [childId, search.grade, search.line, viewGrade, navigate]);

  const mapQ = useQuery({
    queryKey: ["map", childId, viewGrade],
    queryFn: () => getMapState({ data: { childId: childId!, grade: viewGrade } }),
    enabled: Boolean(childId),
  });

  if (childrenQ.isLoading || (childId && mapQ.isLoading) || !mapQ.data) {
    return (
      <AppShell>
        <div className="mx-auto max-w-5xl px-4 py-10">
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </AppShell>
    );
  }

  const data = mapQ.data;
  const pairs = pairsForGrade(viewGrade);

  return (
    <AppShell childName={data.child.name} grade={data.child.grade}>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <p className="text-xs tracking-[0.2em] text-fg-subtle">{t("mapKicker")}</p>
        <h1 className="mt-1 font-display text-3xl">{t("mapTitle")}</h1>
        <p className="mt-2 max-w-lg text-sm text-fg-muted">{t("mapLead")}</p>
        <div className="mt-6">
          <GradeSwitcher
            value={viewGrade}
            hrefBase="/app/map"
            childId={childId ?? undefined}
            search={search.line ? { line: search.line } : undefined}
          />
        </div>
        <div className="mt-4 rounded-lg border border-border bg-surface px-4 py-4">
          <p className="text-xs tracking-[0.2em] text-fg-subtle">{t("workshopKicker")}</p>
          <p className="mt-1 font-display text-lg">{t("workshopTitle")}</p>
          <p className="mt-1 text-sm text-fg-muted">{t("workshopLead")}</p>
          <Link
            to="/app/workshop"
            search={{ grade: viewGrade }}
            className="mt-3 inline-flex h-11 items-center rounded-md border border-border bg-bg px-4 text-sm font-medium hover:bg-bg-warm"
          >
            {t("workshopTry")}
          </Link>
        </div>
        <div className="mt-6">
          <RouteMap
            lines={data.lines}
            hrefBase="/app"
            childId={childId ?? undefined}
            activeGrade={viewGrade}
            focusLineId={search.line}
          />
        </div>
        <div className="mt-6">
          <ConfusableList
            pairs={pairs}
            hrefBase="/app"
            childId={childId ?? undefined}
            childGrade={viewGrade}
          />
        </div>
      </main>
    </AppShell>
  );
}
