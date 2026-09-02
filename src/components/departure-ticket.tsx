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
  disabled,
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
  /**
   * Commerce spec §3.3: a lapsed/cancelled household's empty-day boarding
   * pass renders the SAME `きょうは おやすみ` copy as an entitled household
   * with nothing due today, but with no date and no free-ride affordance,
   * and is disabled. This is the one place the disabled empty state is
   * correct — never "fix" it back to the live free-ride version by
   * pattern-matching on that shipped behaviour; they render the same lead
   * text on purpose but are not the same state. No price, no lock icon, no
   * upgrade prompt anywhere in this component, entitled or not.
   */
  disabled?: boolean;
}) {
  const count = countLabel ?? `${glyphs.length}えき`;
  const showEmpty = empty || disabled;
  return (
    <button
      type="button"
      data-departure-ticket
      data-ticket-empty={showEmpty || undefined}
      data-ticket-disabled={disabled || undefined}
      aria-label={ariaName}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      onClick={onRide}
      className={cn(
        "mx-auto flex w-full max-w-[448px] min-h-16 flex-col gap-2 rounded-lg border-2 border-primary bg-surface px-5 py-4 text-left text-ticket-ink",
        disabled && "cursor-default border-border opacity-70",
      )}
    >
      <span className="flex items-center justify-between gap-3">
        <span className="text-xs tracking-[0.2em] text-fg-subtle">{stationLabel}</span>
        {!disabled && echoDue && nextArrivalLabel ? (
          <span className="text-xs text-primary">{nextArrivalLabel}</span>
        ) : null}
      </span>
      {showEmpty ? (
        <span className="text-sm leading-7 text-fg-muted">
          {emptyLead}
          {!disabled && nextArrivalLabel ? `  ${nextArrivalLabel}` : ""}
        </span>
      ) : (
        <span className="flex flex-wrap items-end justify-between gap-2">
          <span className="font-display text-3xl leading-none tracking-wide">
            {glyphs.join(" ")}
          </span>
          <span className="text-xs text-fg-subtle">{count}</span>
        </span>
      )}
      {disabled ? null : <span className="text-right font-display text-lg text-primary">▶ {rideLabel}</span>}
    </button>
  );
}