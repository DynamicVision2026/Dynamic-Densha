import { Link } from "@tanstack/react-router";
import type { DepartureBoard } from "@/lib/departure-board";
import { useI18n } from "@/lib/i18n/i18n";
import type { Grade } from "@/data/kyoiku";

export function DepartureBoardView({
  board,
  hrefBase,
  grade,
  childId,
  mode,
}: {
  board: DepartureBoard;
  hrefBase: "/demo" | "/app";
  grade?: Grade;
  childId?: string;
  mode?: "play" | "look";
}) {
  const { t } = useI18n();
  const to = hrefBase === "/demo" ? "/demo/kanji/$char" : "/app/kanji/$char";
  const search = {
    ...(childId ? { child: childId } : {}),
    mode: mode ?? "play",
    ...(grade ? { grade } : {}),
  };

  function Cars({
    chars,
    kind,
  }: {
    chars: { kanji: string; label?: string }[];
    kind: string;
  }) {
    if (chars.length === 0) return <p className="mt-2 text-sm text-fg-subtle">{t("boardEmpty")}</p>;
    return (
      <div className="mt-2 flex flex-wrap gap-2">
        {chars.map((c) => (
          <Link
            key={`${kind}-${c.kanji}`}
            to={to}
            params={{ char: c.kanji }}
            search={search}
            data-board-car={c.kanji}
            className="inline-flex h-11 min-w-11 items-center justify-center gap-1 rounded-md border border-border bg-bg px-2.5 font-display text-xl hover:bg-bg-warm"
          >
            {c.kanji}
            {c.label ? (
              <span className="font-sans text-[10px] text-fg-subtle">{c.label}</span>
            ) : null}
          </Link>
        ))}
      </div>
    );
  }

  return (
    <section
      className="mt-4 rounded-lg border border-border bg-surface px-5 py-4"
      data-departure-board
    >
      <p className="text-xs tracking-[0.2em] text-fg-subtle">{t("boardTitle")}</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-sm font-medium">{t("boardToday")}</p>
          <Cars
            kind="today"
            chars={board.today.map((c) => ({
              kanji: c.kanji,
              label: c.kind === "inspect" ? t("boardInspect") : t("echoArrivalToday"),
            }))}
          />
        </div>
        <div>
          <p className="text-sm font-medium">{t("boardTomorrow")}</p>
          <Cars
            kind="tomorrow"
            chars={board.tomorrow.map((c) => ({
              kanji: c.kanji,
              label: c.when === "dayAfter" ? t("echoArrivalDayAfter") : t("echoArrivalTomorrow"),
            }))}
          />
        </div>
        <div>
          <p className="text-sm font-medium">{t("boardNew")}</p>
          <Cars kind="new" chars={board.newStations.map((kanji) => ({ kanji }))} />
        </div>
        <div>
          <p className="text-sm font-medium">{t("boardReturn")}</p>
          <Cars kind="return" chars={board.returnStations.map((kanji) => ({ kanji }))} />
        </div>
      </div>
      <p className="mt-3 text-xs text-fg-subtle">{t("boardInspectLead")}</p>
    </section>
  );
}
