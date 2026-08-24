import { START_BANDS, type StartBand } from "@/lib/grade-route";
import { useI18n } from "@/lib/i18n/i18n";
import { cn } from "@/lib/utils";

const BAND_KEY = {
  beginning: "startBandBeginning",
  middle: "startBandMiddle",
  end: "startBandEnd",
} as const;

export function StartBandPicker({
  value,
  onChange,
  disabled,
}: {
  value: StartBand;
  onChange: (band: StartBand) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div data-start-band={value}>
      <p className="text-xs tracking-[0.2em] text-fg-subtle">{t("startBand")}</p>
      <p className="mt-1 text-sm text-fg-muted">{t("startBandLead")}</p>
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        {START_BANDS.map((band) => (
          <button
            key={band}
            type="button"
            disabled={disabled}
            data-tour={`band-${band}`}
            onClick={() => onChange(band)}
            className={cn(
              "h-11 rounded-md border text-sm font-medium",
              value === band ? "border-fg bg-fg text-bg" : "border-border bg-surface text-fg",
            )}
          >
            {t(BAND_KEY[band])}
          </button>
        ))}
      </div>
    </div>
  );
}
