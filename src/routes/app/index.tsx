import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ChildHome } from "@/components/child-home";
import { ChildShell } from "@/components/child-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { readActiveChildId, writeActiveChildId } from "@/lib/active-child";
import { resolveActiveGrade, usePersistActiveGrade } from "@/lib/active-grade";
import { gradeSearchFrom } from "@/lib/grade-nav";
import { listChildren } from "@/lib/server/children";
import { getHomeState, getMapState } from "@/lib/server/progress";
import type { Grade } from "@/data/kyoiku";

export const Route = createFileRoute("/app/")({
  component: AppHome,
  validateSearch: gradeSearchFrom,
});

function AppHome() {
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
      void navigate({ to: "/app", search: { grade: viewGrade }, replace: true });
    }
  }, [childId, search.grade, viewGrade, navigate]);

  const homeQ = useQuery({
    queryKey: ["home", childId, viewGrade],
    queryFn: () => getHomeState({ data: { childId: childId!, grade: viewGrade } }),
    enabled: Boolean(childId),
  });
  const mapQ = useQuery({
    queryKey: ["map", childId, viewGrade],
    queryFn: () => getMapState({ data: { childId: childId!, grade: viewGrade } }),
    enabled: Boolean(childId),
  });

  if (childrenQ.isLoading || (childId && homeQ.isLoading) || !homeQ.data) {
    return (
      <ChildShell>
        <div className="mx-auto flex w-full max-w-[900px] flex-1 items-center px-4">
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      </ChildShell>
    );
  }

  const home = homeQ.data;
  const cars = home.trains.flatMap((t) =>
    t.cars.map((c) => ({ char: c.char, status: c.status, echoDue: c.echoDue })),
  );

  return (
    <ChildHome
      hrefBase="/app"
      childId={childId ?? undefined}
      grade={viewGrade}
      profileGrade={childGrade}
      cars={cars}
      board={home.board}
      echoQueue={home.echoQueue}
      lines={mapQ.data?.lines ?? []}
      rings={home.rings ?? []}
    />
  );
}
