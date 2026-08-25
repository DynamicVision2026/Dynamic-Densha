import { useEffect, useRef } from "react";
import { RouteMap, type MapLineView } from "@/components/route-map";
import { useI18n } from "@/lib/i18n/i18n";
import type { Grade } from "@/data/kyoiku";

function pinchDistance(touches: React.TouchList) {
  if (touches.length < 2) return 0;
  const a = touches[0]!;
  const b = touches[1]!;
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

export function MapOverlay({
  open,
  lines,
  hrefBase,
  childId,
  grade,
  onClose,
}: {
  open: boolean;
  lines: MapLineView[];
  hrefBase: "/demo" | "/app";
  childId?: string;
  grade?: Grade;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const pinchStart = useRef(0);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCloseRef.current();
    }
    window.addEventListener("keydown", onKey);
    const id = requestAnimationFrame(() => closeRef.current?.focus());
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-30 flex flex-col bg-bg/80 backdrop-blur-[2px]"
      data-map-overlay
      role="dialog"
      aria-modal="true"
      aria-label={t("mapTitle")}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onTouchStart={(e) => {
        if (e.touches.length === 2) pinchStart.current = pinchDistance(e.touches);
      }}
      onTouchMove={(e) => {
        if (e.touches.length !== 2 || !pinchStart.current) return;
        if (pinchDistance(e.touches) < pinchStart.current * 0.82) {
          pinchStart.current = 0;
          onClose();
        }
      }}
      onTouchEnd={() => {
        pinchStart.current = 0;
      }}
    >
      <div className="map-overlay-sheet mx-auto flex min-h-0 w-full max-w-[900px] flex-1 flex-col overflow-hidden bg-surface shadow-soft">
        <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">
          <button
            ref={closeRef}
            type="button"
            className="inline-flex h-11 min-w-11 items-center justify-center rounded-md px-3 text-sm text-fg-muted"
            onClick={onClose}
            data-map-close
          >
            {t("backChild")}
          </button>
          <p className="font-display text-lg">{t("mapTitle")}</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          <RouteMap lines={lines} hrefBase={hrefBase} childId={childId} activeGrade={grade} />
        </div>
      </div>
    </div>
  );
}
