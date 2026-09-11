import { createFileRoute, Navigate } from "@tanstack/react-router";
import { ChildShell } from "@/components/child-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { useResolvedChildId } from "@/lib/use-resolved-child";
import { workshopSearchFrom } from "@/lib/grade-nav";

/**
 * Pre-scoping path, kept as a redirect. Child surfaces moved to
 * /app/child/$childId/... (see src/routes/app/child.$childId.tsx); this
 * resolves which child the caller meant and forwards. Not deleted, because
 * this URL is in real browser histories and home-screen shortcuts.
 */
export const Route = createFileRoute("/app/workshop")({
  component: LegacyWorkshop,
  validateSearch: workshopSearchFrom,
});

function LegacyWorkshop() {
  const search = Route.useSearch();
  const childId = useResolvedChildId();

  if (childId === undefined) {
    return (
      <ChildShell>
        <div className="grid flex-1 place-items-center px-4">
          <Skeleton className="h-48 w-full max-w-[900px] rounded-[28px]" />
        </div>
      </ChildShell>
    );
  }
  if (childId === null) return <Navigate to="/onboard" replace />;

  return <Navigate to="/app/child/$childId/workshop" params={{ childId }} search={search} replace />;
}
