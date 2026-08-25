import { Link, useRouterState } from "@tanstack/react-router";
import { BookMarked, Hammer, Map, Search, TrainFront } from "lucide-react";
import { readStoredActiveGrade } from "@/lib/active-grade";
import { parseGrade, parseGradeFromSearchStr } from "@/lib/grade-nav";
import { useI18n } from "@/lib/i18n/i18n";
import { cn } from "@/lib/utils";

export function WorldNav({
  hrefBase,
  grade: gradeOverride,
}: {
  hrefBase: "/demo" | "/app";
  grade?: number;
}) {
  const { t } = useI18n();
  const { path, searchStr } = useRouterState({
    select: (s) => ({ path: s.location.pathname, searchStr: s.location.searchStr }),
  });
  const grade =
    parseGrade(gradeOverride) ?? parseGradeFromSearchStr(searchStr) ?? readStoredActiveGrade();
  const gradeSearch = grade ? { grade } : undefined;
  const items = [
    {
      to: hrefBase,
      key: "navTimetable" as const,
      icon: TrainFront,
      match: (p: string) => p === hrefBase || p === `${hrefBase}/`,
    },
    {
      to: `${hrefBase}/map`,
      key: "navMap" as const,
      icon: Map,
      match: (p: string) => p.startsWith(`${hrefBase}/map`),
    },
    {
      to: `${hrefBase}/workshop`,
      key: "navWorkshop" as const,
      icon: Hammer,
      match: (p: string) => p.startsWith(`${hrefBase}/workshop`),
    },
    {
      to: `${hrefBase}/stamps`,
      key: "navStamps" as const,
      icon: BookMarked,
      match: (p: string) => p.startsWith(`${hrefBase}/stamps`),
    },
    {
      to: `${hrefBase}/catalog`,
      key: "navCatalog" as const,
      icon: Search,
      match: (p: string) => p.startsWith(`${hrefBase}/catalog`),
    },
  ];

  return (
    <nav aria-label={t("navWorld")} className="flex gap-1 overflow-x-auto" data-tour="world-nav">
      {items.map((item) => {
        const Icon = item.icon;
        const active = item.match(path);
        return (
          <Link
            key={item.key}
            to={item.to}
            search={gradeSearch}
            className={cn(
              "inline-flex h-11 min-w-11 items-center gap-1.5 rounded-md px-3 text-sm font-medium",
              active ? "bg-fg text-bg" : "text-fg-muted hover:bg-bg-warm hover:text-fg",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {t(item.key)}
          </Link>
        );
      })}
    </nav>
  );
}
