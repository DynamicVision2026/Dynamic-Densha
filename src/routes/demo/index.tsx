import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ChildHome } from "@/components/child-home";
import { DEMO_CHILD, getDemoHome, getDemoMap } from "@/lib/demo-progress";
import { resolveActiveGrade, usePersistActiveGrade } from "@/lib/active-grade";
import { gradeSearchFrom } from "@/lib/grade-nav";

export const Route = createFileRoute("/demo/")({
  component: DemoHome,
  ssr: false,
  validateSearch: gradeSearchFrom,
});

function DemoHome() {
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
  const home = getDemoHome(viewGrade);
  const map = getDemoMap(viewGrade);
  const cars = home.trains.flatMap((t) =>
    t.cars.map((c) => ({ char: c.char, status: c.status, echoDue: c.echoDue })),
  );

  return (
    <ChildHome
      hrefBase="/demo"
      grade={viewGrade}
      profileGrade={DEMO_CHILD.grade}
      cars={cars}
      board={home.board}
      echoQueue={home.echoQueue}
      lines={map.lines}
      rings={home.rings}
    />
  );
}
