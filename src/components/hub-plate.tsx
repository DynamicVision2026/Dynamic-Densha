import { useI18n } from "@/lib/i18n/i18n";
import { cn } from "@/lib/utils";

/** Left-of-strip hub: みどり N aggregate only. Tap flips to overview. */
export function HubPlate({
  green,
  ridden,
  total,
  onOpen,
}: {
  green: number;
  ridden: number;
  total: number;
  onOpen: () => void;
}) {
  const { t } = useI18n();
  const r = 16;
  const c = 2 * Math.PI * r;
  const frac = total > 0 ? Math.min(1, green / total) : 0;
  const offset = c * (1 - frac);

  return (
    <button
      type="button"
      data-hub
      data-open-overview
      onClick={onOpen}
      className={cn(
        "relative grid size-[88px] shrink-0 place-items-center rounded-full border border-border bg-surface text-center",
        "active:scale-[0.96] transition-transform duration-150 ease-out",
      )}
      aria-label={`${t("hubGreen")} ${green}`}
    >
      <svg className="pointer-events-none absolute inset-1" viewBox="0 0 40 40" aria-hidden>
        <circle cx="20" cy="20" r={r} fill="none" stroke="currentColor" strokeWidth="2" className="text-border" />
        <circle
          cx="20"
          cy="20"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          className="text-status-perfect"
          strokeDasharray={c}
          strokeDashoffset={offset}
          transform="rotate(-90 20 20)"
        />
      </svg>
      <span className="relative z-[1] flex flex-col items-center leading-none">
        <span className="text-[10px] tracking-wide text-fg-subtle">{t("hubGreen")}</span>
        <span className="font-display text-2xl tabular-nums text-status-perfect">{green}</span>
        {ridden > 0 ? (
          <span className="mt-0.5 text-[10px] text-fg-subtle">
            {t("hubRidden")} {ridden}
          </span>
        ) : null}
      </span>
    </button>
  );
}
