import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useAutoDemo } from "@/components/auto-demo";
import { ChildShell } from "@/components/child-shell";
import type { BeatId } from "@/lib/progress-eval";
import { parseGrade } from "@/lib/grade-nav";
import { useI18n } from "@/lib/i18n/i18n";
import { cn } from "@/lib/utils";

const BEATS: BeatId[] = ["encounter", "understand", "practice", "feedback"];

function beatIndex(beat: BeatId): number {
  if (beat === "echo") return 2;
  return Math.max(0, BEATS.indexOf(beat));
}

export function RideShell({
  home,
  char,
  beat,
  grade,
  children,
  action,
}: {
  home: "/demo" | "/app";
  char: string;
  beat: BeatId;
  grade?: number;
  children: ReactNode;
  action: ReactNode;
}) {
  const { t } = useI18n();
  const tour = useAutoDemo();
  const idx = beatIndex(beat);
  const g = parseGrade(grade);
  const search = g ? { grade: g } : undefined;

  return (
    <ChildShell>
      {tour.active ? (
        <p className="shrink-0 bg-bg-warm px-4 py-1 text-center text-[11px] text-fg-muted">
          {t("tourLiveBanner")}
        </p>
      ) : null}
      <header className="flex h-16 shrink-0 items-center gap-2 px-3 pt-[env(safe-area-inset-top)]">
        <Link
          to={home}
          search={search}
          data-tour="back-timetable"
          className="inline-flex h-11 min-w-11 items-center rounded-md px-2 text-sm text-fg-subtle"
        >
          {t("quitRide")}
        </Link>
        <ol className="mx-auto flex gap-1.5" aria-label={t("beatDots")}>
          {BEATS.map((id, i) => (
            <li
              key={id}
              className={cn(
                "size-2 rounded-full",
                i <= idx ? "bg-fg" : "bg-border-strong",
              )}
            />
          ))}
        </ol>
        <p className="min-w-11 text-right font-display text-xl leading-none">{char}</p>
      </header>
      <div
        data-ride-body
        className="flex min-h-0 flex-1 flex-col overflow-hidden landscape:flex-row"
      >
        <section
          data-ride-stage
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-4 pt-2 landscape:flex-none landscape:basis-[55%]"
        >
          {children}
        </section>
        <section
          data-ride-action
          className="flex min-h-0 shrink-0 flex-[0_0_42%] flex-col justify-end gap-3 overflow-y-auto overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 landscape:h-full landscape:flex-[0_0_45%] landscape:justify-center"
        >
          {action}
        </section>
      </div>
    </ChildShell>
  );
}
