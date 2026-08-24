import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { CatalogPage } from "@/components/catalog-page";
import { Skeleton } from "@/components/ui/skeleton";
import { readActiveChildId, writeActiveChildId } from "@/lib/active-child";
import { catalogSearchFrom } from "@/lib/grade-nav";
import { listChildren } from "@/lib/server/children";
import type { Grade } from "@/data/kyoiku";

export const Route = createFileRoute("/app/catalog")({
  component: AppCatalog,
  validateSearch: catalogSearchFrom,
});

function AppCatalog() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [childId, setChildId] = useState<string | null>(null);
  const childrenQ = useQuery({ queryKey: ["children"], queryFn: () => listChildren() });

  useEffect(() => {
    if (!childrenQ.data) return;
    if (childrenQ.data.length === 0) {
      void navigate({ to: "/onboard" });
      return;
    }
    const stored = readActiveChildId();
    const next =
      (stored && childrenQ.data.some((c) => c.id === stored) && stored) || childrenQ.data[0]!.id;
    setChildId(next);
    writeActiveChildId(next);
  }, [childrenQ.data, navigate]);

  const current = useMemo(
    () => childrenQ.data?.find((c) => c.id === childId),
    [childrenQ.data, childId],
  );

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
      hrefBase="/app"
      childName={current.name}
      childGrade={current.grade as Grade}
      viewGrade={search.grade}
      query={search.q ?? ""}
    />
  );
}
