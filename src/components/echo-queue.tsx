import { Link } from "@tanstack/react-router";
import { echoArrivalWhen } from "@/lib/echo-arrival";
import { useI18n } from "@/lib/i18n/i18n";
import type { ProgressState } from "@/lib/progress-eval";

export function EchoQueue({
  rows,
  hrefBase,
  childId,
  mode,
}: {
  rows: ProgressState[];
  hrefBase: "/demo" | "/app";
  childId?: string;
  mode?: "play" | "look";
}) {
  const { t } = useI18n();
  const now = new Date().toISOString();
  if (rows.length === 0) return null;
  return (
    <div className="mt-4 rounded-lg border border-border bg-surface px-5 py-4">
      <p className="text-xs tracking-[0.2em] text-fg-subtle">{t("echoQueueTitle")}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {rows.map((row) => {
          const second = (row.echoSuccessCount ?? 0) >= 1;
          const when = row.echoDueAt ? echoArrivalWhen(row.echoDueAt, now, t) : t("echoArrivalToday");
          return (
            <Link
              key={row.kanji}
              to={hrefBase === "/demo" ? "/demo/kanji/$char" : "/app/kanji/$char"}
              params={{ char: row.kanji }}
              search={
                childId
                  ? { child: childId, mode: mode ?? "play" }
                  : { mode: mode ?? "play" }
              }
              data-tour={`echo-${row.kanji}`}
              data-echo-arrival={row.kanji}
              className="inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-md bg-engine px-3 font-display text-xl text-engine-fg"
            >
              {row.kanji}
              <span className="font-sans text-[11px] font-medium tracking-normal">{when}</span>
              {second ? (
                <span className="font-sans text-[11px] font-medium tracking-normal">
                  {t("echoRoundChip")}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
      {rows.some((r) => (r.echoSuccessCount ?? 0) >= 1) ? (
        <p className="mt-3 text-xs text-fg-subtle">{t("echoSecondDue")}</p>
      ) : null}
    </div>
  );
}
