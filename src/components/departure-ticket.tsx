import { cn } from "@/lib/utils";

export function DepartureTicket({
  glyphs,
  empty,
  nextArrivalLabel,
  echoDue,
  onRide,
  ariaName = "きょうの きっぷ、のる",
  stationLabel = "きょうの きっぷ",
  rideLabel = "のる",
  emptyLead = "きょうは おやすみ",
  countLabel,
}: {
  glyphs: string[];
  empty: boolean;
  nextArrivalLabel?: string | null;
  echoDue?: boolean;
  onRide: () => void;
  ariaName?: string;
  stationLabel?: string;
  rideLabel?: string;
  emptyLead?: string;
  countLabel?: string;
}) {
  const count = countLabel ?? `${glyphs.length}えき`;
  return (
    <button
      type="button"
      data-departure-ticket
      data-ticket-empty={empty || undefined}
      aria-label={ariaName}
      onClick={onRide}
      className={cn(
        "mx-auto flex w-full max-w-[448px] min-h-16 flex-col gap-2 rounded-lg border-2 border-primary bg-surface px-5 py-4 text-left text-ticket-ink",
      )}
    >
      <span className="flex items-center justify-between gap-3">
        <span className="text-xs tracking-[0.2em] text-fg-subtle">{stationLabel}</span>
        {echoDue && nextArrivalLabel ? (
          <span className="text-xs text-primary">{nextArrivalLabel}</span>
        ) : null}
      </span>
      {empty ? (
        <span className="text-sm leading-7 text-fg-muted">
          {emptyLead}
          {nextArrivalLabel ? `  ${nextArrivalLabel}` : ""}
        </span>
      ) : (
        <span className="flex flex-wrap items-end justify-between gap-2">
          <span className="font-display text-3xl leading-none tracking-wide">
            {glyphs.join(" ")}
          </span>
          <span className="text-xs text-fg-subtle">{count}</span>
        </span>
      )}
      <span className="text-right font-display text-lg text-primary">▶ {rideLabel}</span>
    </button>
  );
}