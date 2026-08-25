import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/i18n";
import { cn } from "@/lib/utils";

const HOLD_MS = 1500;

function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Child-home 保護者 door: pointer hold ~1.5s.
 * Keyboard / screen reader / Switch: immediate (separate a11y control).
 */
export function ParentDoor({
  to,
  className,
}: {
  to: "/demo/parent" | "/app/parent";
  className?: string;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [fill, setFill] = useState(0);
  const fillRef = useRef(0);
  const pointerHold = useRef(false);
  const raf = useRef(0);
  const start = useRef(0);

  function setProgress(n: number) {
    fillRef.current = n;
    setFill(n);
  }

  function go() {
    stopHold();
    void navigate({ to });
  }

  function stopHold() {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = 0;
  }

  function tick() {
    if (!pointerHold.current) return;
    const next = Math.min(1, (Date.now() - start.current) / HOLD_MS);
    setProgress(next);
    if (next >= 1) {
      go();
      return;
    }
    raf.current = requestAnimationFrame(tick);
  }

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointerHold.current = true;
    if (prefersReducedMotion()) {
      setProgress(1);
      go();
      return;
    }
    start.current = Date.now();
    setProgress(0.08);
    raf.current = requestAnimationFrame(tick);
  }

  function onPointerEnd() {
    stopHold();
    if (fillRef.current < 1) setProgress(0);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      go();
    }
  }

  function onClick(e: React.MouseEvent<HTMLButtonElement>) {
    const fromPointer = pointerHold.current;
    pointerHold.current = false;
    if (fromPointer) {
      if (fillRef.current < 1) e.preventDefault();
      return;
    }
    go();
  }

  useEffect(() => () => stopHold(), []);

  const r = 16;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - fill);

  return (
    <div className={cn("relative size-[88px] shrink-0 rounded-full has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring", className)}>
      <button
        type="button"
        aria-label={t("parentAria")}
        data-parent-a11y
        onClick={go}
        onKeyDown={onKeyDown}
        className="absolute inset-0 z-0 rounded-full"
      />
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        data-parent-door
        data-hold-ms={HOLD_MS}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onLostPointerCapture={onPointerEnd}
        onClick={onClick}
        className="relative z-10 grid size-[88px] place-items-center rounded-full border border-border bg-surface text-center font-medium leading-tight text-fg-muted"
      >
        <svg
          className="pointer-events-none absolute inset-1"
          viewBox="0 0 40 40"
          aria-hidden
        >
          <circle
            cx="20"
            cy="20"
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-border"
          />
          <circle
            cx="20"
            cy="20"
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            className="text-engine"
            strokeDasharray={c}
            strokeDashoffset={offset}
            transform="rotate(-90 20 20)"
          />
        </svg>
        <span className="relative z-[1] px-1 text-xs tracking-wide">{t("parentDoor")}</span>
      </button>
    </div>
  );
}
