import { Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { STATUS_META, type MasteryStatus } from "@/lib/mastery";
import { useI18n } from "@/lib/i18n/i18n";
import type { StripCar } from "@/lib/pick-departure";
import type { Grade } from "@/data/kyoiku";
import { cn } from "@/lib/utils";

function pinchDistance(touches: React.TouchList) {
  if (touches.length < 2) return 0;
  const a = touches[0]!;
  const b = touches[1]!;
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

export function HomeLineStrip({
  cars,
  currentChar,
  hrefBase,
  childId,
  grade,
  onOpenMap,
}: {
  cars: StripCar[];
  currentChar?: string;
  hrefBase: "/demo" | "/app";
  childId?: string;
  grade: Grade;
  onOpenMap: () => void;
}) {
  const { t } = useI18n();
  const scroller = useRef<HTMLDivElement>(null);
  const pinchStart = useRef(0);
  const rideTo = hrefBase === "/demo" ? "/demo/kanji/$char" : "/app/kanji/$char";
  const search = { ...(childId ? { child: childId } : {}), grade };

  useEffect(() => {
    const root = scroller.current;
    if (!root || !currentChar) return;
    const el = root.querySelector(`[data-strip-car="${currentChar}"]`);
    el?.scrollIntoView({ inline: "center", block: "nearest", behavior: "instant" });
  }, [currentChar, cars.length]);

  return (
    <div className="flex min-w-0 flex-1 items-stretch gap-2">
      <button
        type="button"
        data-open-map
        onClick={onOpenMap}
        className="inline-flex h-11 shrink-0 items-center self-center rounded-md px-2 text-xs text-fg-subtle"
      >
        {t("navMap")}
      </button>
      <div
        ref={scroller}
        data-tour="train-1"
        data-line-strip
        role="list"
        aria-label={t("navMap")}
        className="flex min-w-0 flex-1 snap-x snap-mandatory items-end gap-3 overflow-x-auto overscroll-x-contain px-1 py-1"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("[data-strip-car]")) return;
          onOpenMap();
        }}
        onTouchStart={(e) => {
          if (e.touches.length === 2) pinchStart.current = pinchDistance(e.touches);
        }}
        onTouchMove={(e) => {
          if (e.touches.length !== 2 || !pinchStart.current) return;
          if (pinchDistance(e.touches) > pinchStart.current * 1.18) {
            pinchStart.current = 0;
            onOpenMap();
          }
        }}
        onTouchEnd={() => {
          pinchStart.current = 0;
        }}
      >
        {cars.map((car) => (
          <StripStation
            key={car.char}
            char={car.char}
            status={car.status}
            echoDue={car.echoDue}
            current={car.char === currentChar}
            to={rideTo}
            search={search}
          />
        ))}
      </div>
    </div>
  );
}

function StripStation({
  char,
  status,
  echoDue,
  current,
  to,
  search,
}: {
  char: string;
  status: MasteryStatus;
  echoDue?: boolean;
  current?: boolean;
  to: "/demo/kanji/$char" | "/app/kanji/$char";
  search: { child?: string; grade: Grade };
}) {
  const meta = STATUS_META[status];
  return (
    <Link
      role="listitem"
      to={to}
      params={{ char }}
      search={search}
      data-strip-car={char}
      data-tour={`car-${char}`}
      className="flex snap-center flex-col items-center gap-1"
    >
      <span
        className={cn(
          "relative grid size-11 place-items-center rounded-md font-display text-xl leading-none",
          meta.className,
          current && "ring-2 ring-fg",
        )}
      >
        {char}
        {echoDue ? (
          <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-engine" aria-hidden />
        ) : null}
      </span>
    </Link>
  );
}
