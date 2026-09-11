import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { ChildHome } from "@/components/child-home";
import { ChildShell } from "@/components/child-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { resolveActiveGrade, usePersistActiveGrade } from "@/lib/active-grade";
import { gradeSearchFrom } from "@/lib/grade-nav";
import { listChildren } from "@/lib/server/children";
import { maybeImportGuestProgress } from "@/lib/guest-migrate-client";
import { getHomeState, getMapState } from "@/lib/server/progress";
import { useNow } from "@/lib/use-now";
import type { Grade } from "@/data/kyoiku";

export const Route = createFileRoute("/app/child/$childId/")({
  component: ChildBoard,
  validateSearch: gradeSearchFrom,
});

/**
 * The station board, for one named child.
 *
 * Everything that used to be resolved from localStorage here is now a route
 * param, and the parent layout (child.$childId.tsx) has already established
 * that the id belongs to this household. What is left is the board itself.
 */
function ChildBoard() {
  const navigate = useNavigate();
  const { childId } = Route.useParams();
  const search = Route.useSearch();

  const childrenQ = useQuery({ queryKey: ["children"], queryFn: () => listChildren() });
  const current = childrenQ.data?.find((c) => c.id === childId);

  useEffect(() => {
    void maybeImportGuestProgress(childId);
  }, [childId]);

  const childGrade = (current?.grade ?? 1) as Grade;
  const viewGrade = resolveActiveGrade({
    urlGrade: search.grade,
    profileGrade: childGrade,
    childId,
  });
  usePersistActiveGrade(viewGrade, childId);
  useEffect(() => {
    if (search.grade == null) {
      void navigate({
        to: "/app/child/$childId",
        params: { childId },
        search: { grade: viewGrade },
        replace: true,
      });
    }
  }, [childId, search.grade, viewGrade, navigate]);

  // Re-render on visibilitychange/focus/midnight and fold the tick into the
  // query key so a board left open overnight refetches from the server's
  // current clock instead of freezing at the last fetch (PI-3).
  const nowTick = useNow();
  const homeQ = useQuery({
    queryKey: ["home", childId, viewGrade, nowTick],
    queryFn: () => getHomeState({ data: { childId, grade: viewGrade } }),
  });
  const mapQ = useQuery({
    queryKey: ["map", childId, viewGrade],
    queryFn: () => getMapState({ data: { childId, grade: viewGrade } }),
  });

  if (childrenQ.isLoading || homeQ.isLoading || !homeQ.data) {
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
      hrefBase="/app/child/$childId"
      childId={childId}
      siblings={(childrenQ.data ?? []).map((c) => ({ id: c.id, name: c.name }))}
      grade={viewGrade}
      profileGrade={childGrade}
      cars={cars}
      board={home.board}
      entitlement={home.entitlement}
      echoQueue={home.echoQueue}
      lines={mapQ.data?.lines ?? []}
      rings={home.rings ?? []}
    />
  );
}
