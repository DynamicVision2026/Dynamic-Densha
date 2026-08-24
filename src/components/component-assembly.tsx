import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/i18n";
import {
  canPlaceComponent,
  isComponentComplete,
  neededPiece,
  type ComponentAssembly,
} from "@/lib/component-assembly";
import { structureHint, structureRetry } from "@/lib/shape-copy";
import { cn } from "@/lib/utils";

function shuffle<T>(items: T[], seed: string): T[] {
  const a = [...items];
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h >>>= 0;
  for (let i = a.length - 1; i > 0; i--) {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    const j = h % (i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function pieceName(data: ComponentAssembly, id: string): string {
  const piece = data.components.find((c) => c.id === id);
  if (!piece) return id;
  const same = data.components.filter((c) => c.label === piece.label);
  if (same.length <= 1) return piece.label;
  const n = same.findIndex((c) => c.id === id) + 1;
  return `${n}つ目の${piece.label}`;
}

export function ComponentAssemblyBoard({
  data,
  locked,
  onComplete,
  onSkip,
}: {
  data: ComponentAssembly;
  locked?: boolean;
  onComplete: () => void;
  onSkip: () => void;
}) {
  const { t } = useI18n();
  const doneRef = useRef(false);
  const placedRef = useRef<string[]>([]);
  const slotFails = useRef<Record<number, number>>({});
  const [placed, setPlaced] = useState<string[]>([]);
  const [hint, setHint] = useState<"wrong" | "demo" | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [demoSlot, setDemoSlot] = useState<number | null>(null);
  const shapeHint = structureHint(data.char);
  const retry = structureRetry(data.char);

  const tray = useMemo(() => shuffle(data.components, `${data.char}|comp`), [data]);
  const remaining = tray.filter((s) => !placed.includes(s.id));
  const complete = isComponentComplete(data, placed.length);
  placedRef.current = placed;

  useEffect(() => {
    setPlaced([]);
    placedRef.current = [];
    slotFails.current = {};
    setHint(null);
    setRejectId(null);
    setDemoSlot(null);
    doneRef.current = false;
  }, [data.char]);

  useEffect(() => {
    if (!complete || locked) return;
    const tmr = window.setTimeout(() => {
      if (doneRef.current) return;
      doneRef.current = true;
      onComplete();
    }, 420);
    return () => window.clearTimeout(tmr);
  }, [complete, locked, onComplete]);

  useEffect(() => {
    if (!hint) return;
    const tmr = window.setTimeout(() => setHint(null), 1600);
    return () => window.clearTimeout(tmr);
  }, [hint]);

  function place(id: string) {
    if (placedRef.current.includes(id)) return;
    const nextPlaced = [...placedRef.current, id];
    placedRef.current = nextPlaced;
    setPlaced(nextPlaced);
    setHint(null);
    setDemoSlot(null);
  }

  function demonstrate() {
    const slot = placedRef.current.length;
    const needed = neededPiece(data, slot);
    if (!needed) return;
    const piece =
      remaining.find((p) => p.label === needed.label && !placedRef.current.includes(p.id)) ??
      data.components.find((p) => p.label === needed.label && !placedRef.current.includes(p.id));
    if (!piece) return;
    setDemoSlot(slot);
    setHint("demo");
    window.setTimeout(() => place(piece.id), 500);
  }

  function tryPlace(id: string) {
    if (locked || complete) return;
    if (placedRef.current.includes(id)) return;
    const slot = placedRef.current.length;
    if (!canPlaceComponent(data, placedRef.current, id)) {
      setRejectId(id);
      window.setTimeout(() => setRejectId((cur) => (cur === id ? null : cur)), 280);
      const fails = (slotFails.current[slot] ?? 0) + 1;
      slotFails.current[slot] = fails;
      if (fails >= 2) {
        demonstrate();
        return;
      }
      setHint("wrong");
      return;
    }
    slotFails.current[slot] = 0;
    place(id);
  }

  const layout = data.layout ?? "row";
  const slots = [...data.components].sort((a, b) => a.slot - b.slot);
  const nextNeeded = neededPiece(data, placed.length);

  return (
    <div className="space-y-5">
      <div className="text-center">
        <p className="text-xs tracking-[0.2em] text-fg-subtle">{t("kindShape")}</p>
        <p className="mt-3 font-display text-6xl leading-none text-fg">{data.char}</p>
        <p className="mt-3 text-sm font-medium">{t("quizComponentAssemble")}</p>
        {shapeHint ? (
          <p className="mt-2 text-sm text-fg-muted" data-shape-hint>
            {shapeHint}
          </p>
        ) : null}
      </div>

      <div className="mx-auto w-full max-w-xs rounded-lg border border-border bg-surface p-4 shadow-soft">
        <div
          className={cn(
            "grid place-items-center gap-2",
            layout === "row" && "grid-cols-2",
            layout === "col" && "grid-cols-1",
            layout === "tri" && "grid-cols-2",
          )}
        >
          {slots.map((slot) => {
            const filledId = placed[slot.slot];
            const filled = filledId ? data.components.find((c) => c.id === filledId) : null;
            const triTop = layout === "tri" && slot.slot === 0;
            return (
              <div
                key={slot.id}
                className={cn(
                  "grid size-16 place-items-center rounded-md border border-dashed border-border-strong bg-bg font-display text-3xl transition-colors duration-150",
                  demoSlot === slot.slot && "border-engine bg-bg-warm",
                  filled && "border-solid border-fg",
                  triTop && "col-span-2",
                )}
              >
                {filled ? filled.path_or_asset : ""}
              </div>
            );
          })}
        </div>
        {complete ? (
          <p className="mt-3 text-center font-display text-4xl text-fg">{data.char}</p>
        ) : null}
      </div>

      <p className="min-h-5 text-center text-sm text-fg-muted" aria-live="polite">
        {hint === "demo"
          ? t("componentHint")
          : hint === "wrong"
            ? `${t("componentWrong")}${retry ? ` ${retry}` : ""}`
            : ""}
      </p>

      <div className="flex flex-wrap justify-center gap-2">
        {remaining.map((s) => {
          const isNext = nextNeeded?.label === s.label;
          return (
            <button
              key={s.id}
              type="button"
              data-tour={isNext ? "component-next" : undefined}
              disabled={locked || complete}
              aria-label={pieceName(data, s.id)}
              onClick={() => tryPlace(s.id)}
              className={cn(
                "grid size-16 min-h-11 place-items-center rounded-md border border-border bg-surface font-display text-3xl shadow-soft",
                isNext && "ring-2 ring-engine",
                rejectId === s.id && "stroke-reject",
              )}
            >
              {s.path_or_asset}
            </button>
          );
        })}
      </div>

      {!complete && !locked ? (
        <div className="text-center">
          <Button type="button" variant="ghost" size="sm" onClick={onSkip}>
            {t("strokeSkip")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
