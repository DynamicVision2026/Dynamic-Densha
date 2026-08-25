import { createFileRoute, Navigate } from "@tanstack/react-router";
import { mapSearchFrom } from "@/lib/grade-nav";

/** 路線図 is an overlay on child home, not a peer route. */
export const Route = createFileRoute("/app/map")({
  component: AppMapRedirect,
  validateSearch: mapSearchFrom,
});

function AppMapRedirect() {
  const search = Route.useSearch();
  return (
    <Navigate
      to="/app"
      search={{
        ...(search.grade ? { grade: search.grade } : {}),
      }}
      replace
    />
  );
}
