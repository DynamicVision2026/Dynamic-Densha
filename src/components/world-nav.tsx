import { Link, useRouterState } from "@tanstack/react-router";
import { BookMarked, Hammer, Map, Search, TrainFront } from "lucide-react";
import { readStoredActiveGrade } from "@/lib/active-grade";
import { parseGrade, parseGradeFromSearchStr } from "@/lib/grade-nav";
import { useI18n } from "@/lib/i18n/i18n";
import { cn } from "@/lib/utils";

/**
 * The world nav, on both surfaces.
 *
 * `hrefBase` is a ROUTE PATTERN, not a resolved path: on the app surface it
 * is literally "/app/child/$childId" and the id travels separately in
 * `params`. That is what lets `${hrefBase}/map` stay a typed route id -- the
 * alternative, interpolating a real id into the string, produces a path
 * TanStack's router types have never heard of, and every link in here would
 * fall back to `string` and stop being checked at all.
 */
export function WorldNav({
  hrefBase,
  childId,
  grade: gradeOverride,
}: {
  hrefBase: "/demo" | "/app/child/$childId";
  childId?: string;
  grade?: number;
}) {
  const { t } = useI18n();
  const { path, searchStr } = useRouterState({
    select: (s) => ({ path: s.location.pathname, searchStr: s.location.searchStr }),
  });
  const grade =
    parseGrade(gradeOverride) ?? parseGradeFromSearchStr(searchStr) ?? readStoredActiveGrade();
  const gradeSearch = grade ? { grade } : undefined;
  // The nav highlights by comparing against the CURRENT pathname, which of
  // course carries a real id rather than the "$childId" placeholder.
  const base = childId ? `/app/child/${childId}` : hrefBase;
  const params = childId ? { childId } : undefined;
  const items = [
    {
      to: hrefBase,
      key: "navTimetable" as const,
      icon: TrainFront,
      match: (p: string) => p === base || p === `${base}/`,
    },
    {
      to: `${hrefBase}/map`,
      key: "navMap" as const,
      icon: Map,
      match: (p: string) => p.startsWith(`${base}/map`),
    },
    {
      to: `${hrefBase}/workshop`,
      key: "navWorkshop" as const,
      icon: Hammer,
      match: (p: string) => p.startsWith(`${base}/workshop`),
    },
    {
      to: `${hrefBase}/stamps`,
      key: "navStamps" as const,
      icon: BookMarked,
      match: (p: string) => p.startsWith(`${base}/stamps`),
    },
    {
      to: `${hrefBase}/catalog`,
      key: "navCatalog" as const,
      icon: Search,
      match: (p: string) => p.startsWith(`${base}/catalog`),
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
            params={params}
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
