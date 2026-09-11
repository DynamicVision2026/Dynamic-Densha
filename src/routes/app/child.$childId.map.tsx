import { createFileRoute, Navigate } from "@tanstack/react-router";
import { mapSearchFrom } from "@/lib/grade-nav";

/** 路線図 is an overlay on the child's board, not a peer route. */
export const Route = createFileRoute("/app/child/$childId/map")({
  component: AppMapRedirect,
  validateSearch: mapSearchFrom,
});

function AppMapRedirect() {
  const { childId } = Route.useParams();
  const search = Route.useSearch();
  return (
    <Navigate
      to="/app/child/$childId"
      params={{ childId }}
      search={{ ...(search.grade ? { grade: search.grade } : {}) }}
      replace
    />
  );
}
