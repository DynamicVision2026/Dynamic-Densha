import { Link, useRouterState } from "@tanstack/react-router";
import { AuthSlot } from "@/components/auth-slot";
import { LanguageSwitcher } from "@/components/language-switcher";
import { WorldNav } from "@/components/world-nav";
import { readStoredActiveGrade } from "@/lib/active-grade";
import { parseGradeFromSearchStr } from "@/lib/grade-nav";
import { useI18n } from "@/lib/i18n/i18n";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function AppShell({
  children,
  childName,
  grade,
  mode,
  onMode,
  right,
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
  const parentTo = path.startsWith("/demo") ? "/demo/parent" : "/app/parent";
  const showParent = path.startsWith("/demo") || path.startsWith("/app");
  const hrefBase = path.startsWith("/demo") ? "/demo" : "/app";
  const showWorld =
    (path.startsWith("/demo") || path.startsWith("/app")) && !path.includes("/kanji/");
  const onParent = path.includes("/parent");
  const urlGrade = parseGradeFromSearchStr(searchStr);
  const stored = readStoredActiveGrade();
  const lens = onParent
    ? (grade ?? urlGrade ?? stored)
    : (urlGrade ?? stored ?? grade);
  const homeSearch = lens ? { grade: lens } : undefined;

  return (
    <div className="paper-wash min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-border/80 bg-bg/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2 px-4 py-3 sm:gap-3">
          <Link
            to={path.startsWith("/demo") ? "/demo" : "/app"}
            search={homeSearch}
            className="flex min-w-0 items-center gap-2"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-sm bg-engine text-[11px] font-display text-engine-fg">
              字
            </span>
            <span className="hidden font-display text-base tracking-wide min-[420px]:inline">{t("brand")}</span>
          </Link>
          {lens ? (
            <p
              className="shrink-0 rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] text-fg-muted"
              data-tour="active-grade"
            >
              {t("nowGrade", { n: lens })}
            </p>
          ) : null}
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            {childName ? (
              <div className="hidden items-center gap-2 sm:flex">
                <span className="grid size-8 place-items-center rounded-full bg-secondary font-display text-sm">
                  {childName.slice(0, 1)}
                </span>
                <div className="leading-tight">
                  <p className="text-sm font-medium">{childName}</p>
                  {grade ? (
                    <p className="text-[11px] text-fg-muted">{t("gradeLabel", { n: grade })}</p>
                  ) : null}
                </div>
              </div>
            ) : null}
            {mode && onMode ? (
              <div className="flex rounded-full border border-border bg-surface p-0.5">
                <button
                  type="button"
                  className={cn(
                    "h-8 rounded-full px-3 text-xs font-medium",
                    mode === "play" ? "bg-fg text-bg" : "text-fg-muted",
                  )}
                  onClick={() => onMode("play")}
                >
                  {t("play")}
                </button>
                <button
                  type="button"
                  className={cn(
                    "h-8 rounded-full px-3 text-xs font-medium",
                    mode === "look" ? "bg-fg text-bg" : "text-fg-muted",
                  )}
                  onClick={() => onMode("look")}
                >
                  {t("look")}
                </button>
              </div>
            ) : null}
            {showParent ? (
              <Link
                to={parentTo}
                className="inline-flex h-11 shrink-0 items-center rounded-md border border-border bg-surface px-2.5 text-sm font-medium sm:px-3"
              >
                {t("parent")}
              </Link>
            ) : null}
            {right}
            <LanguageSwitcher />
            <AuthSlot />
          </div>
        </div>
      </header>
      {showWorld ? (
        <div className="border-b border-border/80 bg-bg/90">
          <div className="mx-auto flex max-w-5xl px-2 py-1 sm:px-4">
            <WorldNav hrefBase={hrefBase} grade={onParent ? grade : lens} />
          </div>
        </div>
      ) : null}
      {children}
    </div>
  );
}
