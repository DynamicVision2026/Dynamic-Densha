import { reachedBlueOrGreen, type GradeRoute } from "@/lib/grade-route";
import { STATUS_META, type MasteryStatus } from "@/lib/mastery";
import type { ProgressState } from "@/lib/progress-eval";
import type { WeeklyPlan } from "@/lib/weekly-plan";
import { useI18n } from "@/lib/i18n/i18n";
import { cn } from "@/lib/utils";

export function GradeRouteStrip({
  route,
  plan,
  progress,
}: {
  route: GradeRoute;
  plan: WeeklyPlan;
  progress: Map<string, ProgressState> | Record<string, ProgressState>;
}) {
  const { t } = useI18n();
  const weekSet = new Set(plan.newKanji);
  const statusOf = (kanji: string): MasteryStatus => {
    const row = progress instanceof Map ? progress.get(kanji) : progress[kanji];
    return row?.status ?? "new";
  };

  return (
    <section
      className="mt-4 rounded-xl border border-border bg-surface p-5"
      data-grade-route
    >
      <h2 className="font-display text-lg">{t("parentRouteTitle")}</h2>
      <p className="mt-1 text-sm text-fg-muted">{t("parentRouteLead")}</p>
      <ol className="mt-4 flex flex-wrap gap-1">
        {route.orderedKanji.map((kanji, i) => {
          const status = statusOf(kanji);
          const inWeek = weekSet.has(kanji);
          const beforeStart = i < route.startIndex;
          const unscheduled = i >= plan.cursor + plan.weeklyNewCap && !reachedBlueOrGreen(status);
          return (
            <li key={`${kanji}-${i}`} title={`${kanji} ${i + 1}`}>
              <span
                data-route-station={kanji}
                data-route-week={inWeek ? "true" : undefined}
                className={cn(
                  "relative grid size-8 place-items-center rounded-sm font-display text-sm",
                  STATUS_META[status].className,
                  unscheduled && status === "new" && "opacity-40",
                  inWeek && "ring-2 ring-engine",
                  i === route.startIndex && "outline outline-1 outline-fg",
                )}
              >
                {kanji}
                {beforeStart && status === "new" ? (
                  <span className="sr-only">{t("routeUnscheduled")}</span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-xs text-fg-subtle">{t("parentNoBehind")}</p>
    </section>
  );
}
