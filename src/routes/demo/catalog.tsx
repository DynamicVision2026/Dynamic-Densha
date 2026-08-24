import { createFileRoute } from "@tanstack/react-router";
import { CatalogPage } from "@/components/catalog-page";
import { DEMO_CHILD } from "@/lib/demo-progress";
import { catalogSearchFrom } from "@/lib/grade-nav";
import { useI18n } from "@/lib/i18n/i18n";

export const Route = createFileRoute("/demo/catalog")({
  component: DemoCatalog,
  ssr: false,
  validateSearch: catalogSearchFrom,
});

function DemoCatalog() {
  const { t } = useI18n();
  const search = Route.useSearch();
  return (
    <CatalogPage
      hrefBase="/demo"
      childName={t("demoName")}
      childGrade={DEMO_CHILD.grade}
      viewGrade={search.grade}
      query={search.q ?? ""}
    />
  );
}
