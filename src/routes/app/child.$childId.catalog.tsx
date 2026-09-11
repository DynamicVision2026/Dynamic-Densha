import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { CatalogPage } from "@/components/catalog-page";
import { Skeleton } from "@/components/ui/skeleton";
import { catalogSearchFrom } from "@/lib/grade-nav";
import { listChildren } from "@/lib/server/children";
import type { Grade } from "@/data/kyoiku";

export const Route = createFileRoute("/app/child/$childId/catalog")({
  component: AppCatalog,
  validateSearch: catalogSearchFrom,
});

function AppCatalog() {
  const { childId } = Route.useParams();
  const search = Route.useSearch();
  const childrenQ = useQuery({ queryKey: ["children"], queryFn: () => listChildren() });
  const current = childrenQ.data?.find((c) => c.id === childId);

  if (!current) {
    return (
      <AppShell>
        <div className="mx-auto max-w-5xl px-4 py-10">
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </AppShell>
    );
  }

  return (
    <CatalogPage
      hrefBase="/app/child/$childId"
      childId={childId}
      childName={current.name}
      childGrade={current.grade as Grade}
      viewGrade={search.grade}
      query={search.q ?? ""}
    />
  );
}
