import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { useI18n } from "@/lib/i18n/i18n";
import { cn } from "@/lib/utils";

export type ParentTab = "report" | "settings";

/**
 * The two-hub frame every parent surface sits in.
 *
 * Daily supervision (学習レポート) and account administration (設定・お手続き)
 * are separate routes, not sections of one scroll, because a parent looking
 * for one is never looking for the other: checking whether a child rode this
 * week and moving a pass between siblings are different errands, minutes and
 * moods apart. The tabs are real links, so each errand is bookmarkable and
 * the back button does what a phone user expects.
 */
export function ParentHub({
  tab,
  childId,
  childName,
  grade,
  children,
}: {
  tab: ParentTab;
  /** Where the 学習レポート tab points. Settings has no child of its own. */
  childId: string | null;
  childName?: string;
  grade?: number;
  children: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <AppShell childName={childName} grade={grade}>
      <main data-parent-doc className="mx-auto w-full max-w-[900px] px-4 py-6 sm:px-5 sm:py-8">
        <p className="text-xs tracking-[0.2em] text-fg-subtle">{t("parentPage")}</p>
        <h1 className="mt-1 font-display text-2xl sm:text-3xl">{t("parentTitle")}</h1>

        <nav
          data-parent-tabs
          aria-label={t("parentPage")}
          className="mt-5 flex gap-1 border-b border-border"
        >
          <HubTab to="report" current={tab === "report"} childId={childId} label={t("parentTabReport")} />
          <HubTab to="settings" current={tab === "settings"} childId={childId} label={t("parentTabSettings")} />
        </nav>

        {children}
      </main>
    </AppShell>
  );
}

/**
 * 44px minimum on the tap target itself, not just the text -- a thumb on a
 * phone is the primary input for this whole surface.
 */
function HubTab({
  to,
  current,
  childId,
  label,
}: {
  to: ParentTab;
  current: boolean;
  childId: string | null;
  label: string;
}) {
  const className = cn(
    "inline-flex min-h-11 items-center border-b-2 px-4 text-sm font-medium -mb-px",
    current ? "border-fg text-fg" : "border-transparent text-fg-muted hover:text-fg",
  );
  const props = { "data-parent-tab": to, "data-parent-tab-current": current || undefined, className };
  // A report link needs a child; with none (a household mid-onboarding) the
  // tab still renders so the two-hub shape is stable, and points at the
  // resolver, which knows what to do about it.
  if (to === "settings") {
    return (
      <Link to="/app/parent/settings" {...props}>
        {label}
      </Link>
    );
  }
  return childId ? (
    <Link to="/app/parent/report/$childId" params={{ childId }} {...props}>
      {label}
    </Link>
  ) : (
    <Link to="/app/parent" {...props}>
      {label}
    </Link>
  );
}

/**
 * The sibling switcher: a horizontally scrolling chip rail on a phone, a
 * wrapping row once there is width for it.
 *
 * Scrolling rather than wrapping on mobile because a household with three
 * children should not cost three stacked rows before the numbers a parent
 * opened the page for. `overscroll-x-contain` stops a horizontal flick at the
 * end of the rail from turning into a back-navigation gesture.
 */
export function SiblingRail({
  childrenList,
  currentId,
  trailing,
}: {
  childrenList: { id: string; name: string; grade: number }[];
  currentId: string;
  trailing?: ReactNode;
}) {
  const { t } = useI18n();
  if (childrenList.length === 0) return null;
  return (
    <div
      data-sibling-rail
      className="-mx-4 mt-5 flex gap-2 overflow-x-auto overscroll-x-contain px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden"
    >
      {childrenList.map((c) => {
        const current = c.id === currentId;
        return (
          <Link
            key={c.id}
            to="/app/parent/report/$childId"
            params={{ childId: c.id }}
            data-child-chip={c.id}
            data-child-chip-current={current || undefined}
            aria-current={current ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm",
              current ? "border-fg bg-fg text-bg" : "border-border bg-surface text-fg",
            )}
          >
            {c.name}
            <span className={cn("ml-1.5 text-xs", current ? "text-bg/70" : "text-fg-muted")}>
              {t("gradeN", { n: c.grade })}
            </span>
          </Link>
        );
      })}
      {trailing}
    </div>
  );
}
