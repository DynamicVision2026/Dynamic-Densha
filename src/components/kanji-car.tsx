import { Link } from "@tanstack/react-router";
import { STATUS_META, type MasteryStatus } from "@/lib/mastery";
import { STATUS_KEYS } from "@/lib/i18n/messages";
import { useI18n } from "@/lib/i18n/i18n";
import { cn } from "@/lib/utils";

export function KanjiCar({
  char,
  status,
  locked,
  to,
  search,
  echoDue,
  arrival,
}: {
  char: string;
  status: MasteryStatus;
  locked?: boolean;
  to?: string;
  search?: Record<string, string>;
  echoDue?: boolean;
  arrival?: string;
}) {
  const { t } = useI18n();
  const meta = STATUS_META[status];
  const label = `${char} ${t(STATUS_KEYS[status])}${arrival ? ` ${arrival}` : ""}`;
  const inner = (
    <span
      className={cn(
        "relative flex h-16 w-12 shrink-0 flex-col items-center justify-center rounded-md font-display text-2xl leading-none transition-[transform,opacity] duration-150 sm:h-20 sm:w-14",
        meta.className,
        locked && "opacity-45",
      )}
    >
      <span className="translate-y-[-2px]">{char}</span>
      <span className="absolute inset-x-2 bottom-[6px] flex justify-center gap-1.5">
        <i className="car-wheel" />
        <i className="car-wheel" />
      </span>
      {echoDue ? (
        <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-engine" aria-hidden="true" />
      ) : null}
    </span>
  );

  const body = (
    <span className="inline-flex flex-col items-center">
      {to && !locked ? (
        <Link
          to={to}
          search={search}
          data-tour={`car-${char}`}
          className="inline-flex rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={label}
        >
          {inner}
        </Link>
      ) : (
        <span className="inline-flex" aria-label={label}>
          {inner}
        </span>
      )}
      {arrival ? (
        <span
          className="mt-1 max-w-14 truncate text-center text-[10px] leading-none text-fg-subtle"
          data-echo-arrival={char}
        >
          {arrival}
        </span>
      ) : null}
    </span>
  );

  return body;
}

export function EngineCar({ index }: { index: number }) {
  const { t } = useI18n();
  return (
    <div
      className="relative flex h-16 w-12 shrink-0 flex-col items-center justify-center rounded-md bg-engine text-engine-fg sm:h-20 sm:w-14"
      aria-hidden="true"
    >
      <span className="font-display text-lg font-semibold tabular-nums leading-none">
        {index}
      </span>
      <span className="mt-0.5 text-[9px] tracking-widest">{t("engine")}</span>
      <span className="absolute inset-x-2 bottom-[6px] flex justify-center gap-1.5">
        <i className="car-wheel !bg-engine-fg/80" />
        <i className="car-wheel !bg-engine-fg/80" />
      </span>
    </div>
  );
}
