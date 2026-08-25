import { Link, useRouterState } from "@tanstack/react-router";
import { AuthSlot } from "@/components/auth-slot";
import { LanguageSwitcher } from "@/components/language-switcher";
import { parseGrade, parseGradeFromSearchStr } from "@/lib/grade-nav";
import { useI18n } from "@/lib/i18n/i18n";
import type { ReactNode } from "react";

/**
 * Parent / browse chrome: sticky header, もどる to child home.
 * Child home and ride supply their own 100dvh shells.
 */
export function AppShell({
  children,
  childName,
  grade,
}: {
  children: ReactNode;
  childName?: string;
  grade?: number;
  mode?: "play" | "look";
  onMode?: (mode: "play" | "look") => void;
  right?: ReactNode;
}) {
  const { t } = useI18n();
  const { path, searchStr } = useRouterState({
    select: (s) => ({ path: s.location.pathname, searchStr: s.location.searchStr }),
  });
  const isRide = path.includes("/kanji/");
  const isChildHome = path === "/demo" || path === "/demo/" || path === "/app" || path === "/app/";
  if (isRide || isChildHome) return children;

  const hrefBase = path.startsWith("/demo") ? "/demo" : path.startsWith("/app") ? "/app" : "/demo";
  const urlGrade = parseGradeFromSearchStr(searchStr);
  const lens = parseGrade(grade) ?? urlGrade;
  const homeSearch = lens ? { grade: lens } : undefined;

  return (
    <div className="paper-wash min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-border/80 bg-bg/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[900px] items-center gap-3 px-4 py-3">
          <Link
            to={hrefBase}
            search={homeSearch}
            className="inline-flex h-11 min-w-11 items-center rounded-md px-2 text-sm text-fg-muted"
          >
            {t("backChild")}
          </Link>
          <span className="font-display text-base tracking-wide">{t("brand")}</span>
          {childName ? (
            <span className="hidden text-sm text-fg-muted sm:inline">
              {childName}
              {grade ? ` · ${t("gradeLabel", { n: grade })}` : ""}
            </span>
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            <LanguageSwitcher />
            <AuthSlot />
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
