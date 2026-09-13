import { Link, useRouterState } from "@tanstack/react-router";
import { AuthSlot } from "@/components/auth-slot";
import { backTargetFor } from "@/lib/back-nav";
import { useCurrentUser } from "@/lib/auth/use-current-user";
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
  // Same React Query entry AuthSlot in this very header already reads, so
  // this costs no extra request.
  const user = useCurrentUser();
  const { path, searchStr } = useRouterState({
    select: (s) => ({ path: s.location.pathname, searchStr: s.location.searchStr }),
  });
  const isRide = path.includes("/kanji/");
  const isChildHome = path === "/demo" || path === "/demo/" || path === "/app" || path === "/app/";
  if (isRide || isChildHome) return children;

  // Decided from the path, the session and ?add -- not from the path alone.
  // The old path-only rule defaulted /onboard to /demo, which threw a
  // signed-in parent adding a sibling out to the marketing tour.
  const back = backTargetFor({
    path,
    signedIn: user != null,
    addingChild: /(^|[?&])add=(1|true)(&|$)/.test(searchStr ?? ""),
  });
  const urlGrade = parseGradeFromSearchStr(searchStr);
  const lens = parseGrade(grade) ?? urlGrade;
  // The grade lens only means anything on a child surface; carrying it to the
  // settings hub would put a stray ?grade= on a household page.
  const homeSearch = lens && (back === "/app" || back === "/demo") ? { grade: lens } : undefined;

  return (
    <div className="paper-wash min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-border/80 bg-bg/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[900px] items-center gap-2 px-3 py-3 sm:gap-3 sm:px-4">
          {back ? (
            <Link
              to={back}
              search={homeSearch}
              data-shell-back={back}
              className="inline-flex h-11 min-w-11 shrink-0 items-center whitespace-nowrap rounded-md px-2 text-sm text-fg-muted"
            >
              {t("backChild")}
            </Link>
          ) : null}
          <span className="shrink-0 whitespace-nowrap font-display text-base tracking-wide">
            {t("brand")}
          </span>
          {childName ? (
            <span className="hidden truncate text-sm text-fg-muted sm:inline">
              {childName}
              {grade ? ` · ${t("gradeLabel", { n: grade })}` : ""}
            </span>
          ) : null}
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <LanguageSwitcher />
            <AuthSlot />
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
