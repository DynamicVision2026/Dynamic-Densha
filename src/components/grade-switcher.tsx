import { Link } from "@tanstack/react-router";
import type { Grade } from "@/data/kyoiku";
import { writeStoredActiveGrade } from "@/lib/active-grade";
import { GRADES } from "@/lib/grade-nav";
import { useI18n } from "@/lib/i18n/i18n";
import { cn } from "@/lib/utils";

export function GradeSwitcher({
  value,
  hrefBase,
  search,
  childId,
}: {
  value?: Grade;
  hrefBase: "/demo" | "/app" | "/demo/catalog" | "/app/catalog" | "/demo/map" | "/app/map";
  search?: Record<string, string | number | undefined>;
  childId?: string;
}) {
  const { t } = useI18n();
  return (
    <nav
      aria-label={t("gradeNav")}
      data-tour="grade-switcher"
      className="flex gap-1 overflow-x-auto pb-1"
    >
      {GRADES.map((n) => {
        const current = n === value;
        return (
          <Link
            key={n}
            to={hrefBase}
            search={{ ...search, grade: n }}
            onClick={() => writeStoredActiveGrade(n, childId)}
            aria-current={current ? "page" : undefined}
            className={cn(
              "inline-flex h-11 min-w-11 shrink-0 items-center justify-center rounded-full px-3 text-sm font-medium",
              current ? "bg-fg text-bg" : "border border-border bg-surface text-fg-muted hover:bg-bg-warm hover:text-fg",
            )}
          >
            {t("gradeN", { n })}
          </Link>
        );
      })}
    </nav>
  );
}
