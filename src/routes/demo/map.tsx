import { createFileRoute, Navigate } from "@tanstack/react-router";
import { mapSearchFrom } from "@/lib/grade-nav";

/** 路線図 is an overlay on child home, not a peer route. */
export const Route = createFileRoute("/demo/map")({
  component: DemoMapRedirect,
  validateSearch: mapSearchFrom,
});

function DemoMapRedirect() {
  const search = Route.useSearch();
  return <Navigate to="/demo" search={{ grade: search.grade }} replace />;
}
