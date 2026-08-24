import type { GradeRoute } from "@/lib/grade-route";
import { STATUS_META, type MasteryStatus } from "@/lib/mastery";
import type { ProgressState } from "@/lib/progress-eval";
import { useI18n } from "@/lib/i18n/i18n";
import { cn } from "@/lib/utils";

export function GradeHistoryList({
  routes,
  progress,
}: {
  routes: GradeRoute[];
  progress: Map<string, ProgressState> | Record<string, ProgressState>;
}) {
  const { t } = useI18n();
  if (!routes.length) return null;
  const statusOf = (kanji: string): MasteryStatus => {
    const row = progress instanceof Map ? progress.get(kanji) : progress[kanji];
    return row?.status ?? "new";
  };

  return (
    <section className="mt-4 rounded-xl border border-border bg-surface p-5" data-grade-history>
      <h2 className="font-display text-lg">{t("historyTitle")}</h2>
      <p className="mt-1 text-sm text-fg-muted">{t("historyLead")}</p>
      <ul className="mt-4 space-y-4">
        {routes.map((route) => {
          const preview = route.orderedKanji.slice(0, 24);
          return (
            <li key={route.id} data-history-grade={route.grade}>
              <p className="text-xs tracking-[0.2em] text-fg-subtle">
                {t("gradeLabel", { n: route.grade })}
              </p>
              <ol className="mt-2 flex flex-wrap gap-1">
                {preview.map((kanji, i) => (
                  <li key={`${route.id}-${kanji}-${i}`}>
                    <span
                      className={cn(
                        "grid size-7 place-items-center rounded-sm font-display text-sm",
                        STATUS_META[statusOf(kanji)].className,
                      )}
                    >
                      {kanji}
                    </span>
                  </li>
                ))}
              </ol>
              {route.orderedKanji.length > preview.length ? (
                <p className="mt-1 text-xs text-fg-subtle">
                  +{route.orderedKanji.length - preview.length}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
