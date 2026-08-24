import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/i18n";
import {
  isAssemblyComplete,
  isNextStroke,
  nextStroke,
  strokeCandidateName,
  type StrokeAssembly,
  type StrokeDef,
} from "@/lib/stroke-assembly";
import { structureHint, structureRetry } from "@/lib/shape-copy";
import { cn } from "@/lib/utils";

const INK = {
  fill: "none",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  strokeWidth: 6,
};

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

function StrokeSvg({
  strokes,
  className,
}: {
  strokes: StrokeDef[];
  className?: string;
}) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      {strokes.map((s) => (
        <path key={s.id} d={s.path} {...INK} className="stroke-fg" />
      ))}
    </svg>
  );
}

export function StrokeAssemblyBoard({
  data,
  locked,
  onComplete,
  onSkip,
}: {
  data: StrokeAssembly;
  locked?: boolean;
  onComplete: () => void;
  onSkip: () => void;
}) {
  const { t } = useI18n();
  const doneRef = useRef(false);
  const [placed, setPlaced] = useState<string[]>([]);
  const [wrong, setWrong] = useState(false);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const placedRef = useRef<string[]>([]);
  const shapeHint = structureHint(data.char);
  const retry = structureRetry(data.char);

  const tray = useMemo(
    () => shuffle(data.strokes, `${data.char}|tray`),
    [data],
  );
  const remaining = tray.filter((s) => !placed.includes(s.id));
  const next = nextStroke(data, placed.length);
  const complete = isAssemblyComplete(data, placed.length);
  placedRef.current = placed;

  useEffect(() => {
    setPlaced([]);
    placedRef.current = [];
    setWrong(false);
    setRejectId(null);
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

  function tryPlace(id: string) {
    if (locked || complete) return;
    if (placedRef.current.includes(id)) return;
    if (!isNextStroke(data, placedRef.current.length, id)) {
      setWrong(true);
      setRejectId(id);
      window.setTimeout(() => setRejectId((cur) => (cur === id ? null : cur)), 280);
      return;
    }
    setWrong(false);
    const nextPlaced = [...placedRef.current, id];
    placedRef.current = nextPlaced;
    setPlaced(nextPlaced);
  }

  return (
    <div className="space-y-5">
      <div className="text-center">
        <p className="text-xs tracking-[0.2em] text-fg-subtle">{t("kindShape")}</p>
        <p className="mt-3 font-display text-6xl leading-none text-fg">{data.char}</p>
        <p className="mt-3 text-sm font-medium">{t("quizShapeAssemble")}</p>
        {shapeHint ? (
          <p className="mt-2 text-sm text-fg-muted" data-shape-hint>
            {shapeHint}
          </p>
        ) : null}
        {!complete ? (
          <p className="mt-1 text-sm text-fg-subtle">{t("strokeGuide")}</p>
        ) : null}
      </div>

      <div className="relative mx-auto aspect-square w-full max-w-xs rounded-lg border border-border bg-surface shadow-soft">
        <svg viewBox="0 0 100 100" className="absolute inset-3">
          {data.strokes.map((s) => (
            <path
              key={`g-${s.id}`}
              d={s.path}
              {...INK}
              className="stroke-border-strong"
              opacity={0.28}
            />
          ))}
          {placed.map((id) => {
            const s = data.strokes.find((x) => x.id === id);
            if (!s) return null;
            return (
              <path
                key={`p-${id}`}
                d={s.path}
                {...INK}
                className="stroke-placed stroke-fg"
              />
            );
          })}
        </svg>
        {complete ? (
          <span className="absolute right-3 bottom-3 grid size-9 place-items-center rounded-full bg-engine font-display text-xs text-engine-fg">
            {t("done")}
          </span>
        ) : null}
      </div>

      <p className="text-center text-xs text-fg-subtle">
        {t("strokeProgress", { done: placed.length, total: data.strokes.length })}
      </p>
      <p className="min-h-5 text-center text-sm text-fg-muted" aria-live="polite">
        {wrong ? `${t("strokeWrongOrder")}${retry ? ` ${retry}` : ""}` : ""}
      </p>

      <div className="flex flex-wrap justify-center gap-2">
        {remaining.map((s) => {
          const index = data.strokes.findIndex((x) => x.id === s.id);
          const isNext = next?.id === s.id;
          return (
            <button
              key={s.id}
              type="button"
              data-tour={isNext ? "stroke-next" : undefined}
              disabled={locked || complete}
              aria-label={strokeCandidateName(data, index)}
              onClick={() => tryPlace(s.id)}
              className={cn(
                "grid size-16 min-h-11 place-items-center rounded-md border border-border bg-surface p-1 shadow-soft",
                isNext && "ring-2 ring-engine",
                rejectId === s.id && "stroke-reject",
              )}
            >
              <StrokeSvg strokes={[s]} />
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
