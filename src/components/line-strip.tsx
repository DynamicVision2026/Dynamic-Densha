import { useI18n } from "@/lib/i18n/i18n";
import type { LineStripView, StripStation } from "@/lib/lines";
import { cn } from "@/lib/utils";

function StationMark({
  station,
  current,
}: {
  station: StripStation;
  current?: boolean;
}) {
  const { t } = useI18n();
  return (
    <li
      className={cn(
        "flex min-w-11 flex-col items-center gap-1",
        station.unopened && "opacity-45",
      )}
    >
      <span
        className={cn(
          "grid size-11 place-items-center rounded-full font-display text-xl leading-none",
          current && !station.unopened && "bg-engine text-engine-fg shadow-soft",
          current && station.unopened && "bg-fg-subtle text-bg",
          !current && "border bg-surface text-fg",
          !current && !station.unopened && "border-fg",
          !current && station.unopened && "border-dashed border-border-strong",
        )}
      >
        {station.kanji}
      </span>
      <span className="text-xs leading-none text-fg-subtle">
        {station.unopened ? t("lineUnopened") : current ? t("lineHere") : "\u00a0"}
      </span>
    </li>
  );
}

function Connector({ phonetic }: { phonetic: boolean }) {
  return (
    <li aria-hidden className="mb-5 min-w-8 flex-1 self-center px-1">
      <span
        className={cn(
          "block w-full",
          phonetic ? "h-px border-t border-dashed border-fg-subtle" : "h-0.5 bg-fg",
        )}
      />
    </li>
  );
}

export function LineStrip({ view }: { view: LineStripView }) {
  const { t } = useI18n();
  const phonetic = view.line.type === "phonetic";
  return (
    <nav
      data-tour="line-strip"
      aria-label={view.line.label_ja}
      className="rounded-lg border border-border bg-surface px-4 py-3 shadow-soft"
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-display text-sm text-fg">{view.line.label_ja}</p>
        <p
          className={cn(
            "text-xs text-fg-subtle",
            phonetic ? "tracking-[0.22em]" : "font-display",
          )}
        >
          {phonetic ? t("linePhonetic") : t("lineSemantic")}
        </p>
      </div>
      <ol className="mt-3 flex items-end">
        {view.prev ? (
          <>
            <StationMark station={view.prev} />
            <Connector phonetic={phonetic} />
          </>
        ) : null}
        <StationMark station={view.current} current />
        {view.next ? (
          <>
            <Connector phonetic={phonetic} />
            <StationMark station={view.next} />
          </>
        ) : null}
      </ol>
    </nav>
  );
}
