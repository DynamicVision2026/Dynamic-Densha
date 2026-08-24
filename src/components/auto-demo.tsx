import { Link } from "@tanstack/react-router";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Pause, Play, RotateCcw, Square } from "lucide-react";
import { prepareDemoTour } from "@/lib/demo-progress";
import { useI18n } from "@/lib/i18n/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";

type TourStatus = "off" | "running" | "paused" | "done";

type Spot = { top: number; left: number; width: number; height: number };

type AutoDemoValue = {
  status: TourStatus;
  active: boolean;
  start: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
};

const AutoDemoContext = createContext<AutoDemoValue | null>(null);

export function useAutoDemo() {
  const ctx = useContext(AutoDemoContext);
  if (!ctx) throw new Error("AutoDemoProvider missing");
  return ctx;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function queryTour(id: string) {
  return document.querySelector(`[data-tour="${id}"]`) as HTMLElement | null;
}

function measure(el: HTMLElement): Spot {
  const r = el.getBoundingClientRect();
  const pad = 6;
  return {
    top: r.top - pad,
    left: r.left - pad,
    width: r.width + pad * 2,
    height: r.height + pad * 2,
  };
}

type RunCtx = {
  signal: AbortSignal;
  paused: () => boolean;
  setCaption: (key: MessageKey) => void;
  setSpot: (spot: Spot | null) => void;
  pace: number;
};

async function yieldTour(ctx: RunCtx) {
  if (ctx.signal.aborted) throw new DOMException("stopped", "AbortError");
  while (ctx.paused()) {
    if (ctx.signal.aborted) throw new DOMException("stopped", "AbortError");
    await sleep(80);
  }
}

async function waitMs(ctx: RunCtx, ms: number) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    await yieldTour(ctx);
    await sleep(40);
  }
}

async function waitFor(ctx: RunCtx, id: string, timeout = 12_000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    await yieldTour(ctx);
    const el = queryTour(id);
    if (el && el.getClientRects().length > 0) {
      el.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
      ctx.setSpot(measure(el));
      return el;
    }
    await sleep(70);
  }
  throw new Error(`tour: missing ${id}`);
}

async function tap(ctx: RunCtx, id: string) {
  await waitFor(ctx, id);
  const until = Date.now() + 6000;
  while (Date.now() < until) {
    await yieldTour(ctx);
    const current = queryTour(id);
    if (current && current.getClientRects().length > 0) {
      const disabled = "disabled" in current && Boolean((current as HTMLButtonElement).disabled);
      if (!disabled) {
        ctx.setSpot(measure(current));
        await waitMs(ctx, ctx.pace * 0.45);
        await yieldTour(ctx);
        current.click();
        await waitMs(ctx, ctx.pace * 0.2);
        return;
      }
    }
    await sleep(50);
  }
  throw new Error(`tour: ${id} stayed disabled`);
}

async function practiceLoop(ctx: RunCtx) {
  for (let i = 0; i < 8; i++) {
    await yieldTour(ctx);
    if (queryTour("feedback")) return;
    const next = queryTour("next");
    if (next) {
      await tap(ctx, "next");
      continue;
    }
    if (queryTour("stroke-next") || queryTour("component-next")) {
      const tourId = queryTour("stroke-next") ? "stroke-next" : "component-next";
      for (let s = 0; s < 12; s++) {
        await yieldTour(ctx);
        if (!queryTour(tourId) && !queryTour("stroke-next") && !queryTour("component-next")) break;
        const id = queryTour("stroke-next") ? "stroke-next" : "component-next";
        if (!queryTour(id)) break;
        await tap(ctx, id);
      }
      const untilStroke = Date.now() + 4000;
      while (Date.now() < untilStroke) {
        await yieldTour(ctx);
        if (queryTour("next") || queryTour("feedback")) break;
        await sleep(60);
      }
      if (queryTour("feedback")) return;
      if (queryTour("next")) await tap(ctx, "next");
      continue;
    }
    await waitFor(ctx, "choice-correct");
    await tap(ctx, "choice-correct");
    await waitFor(ctx, "check");
    const check = queryTour("check") as HTMLButtonElement | null;
    const waitEnabled = Date.now() + 3000;
    while (check?.disabled && Date.now() < waitEnabled) {
      await yieldTour(ctx);
      await sleep(50);
    }
    await tap(ctx, "check");
    const until = Date.now() + 4000;
    while (Date.now() < until) {
      await yieldTour(ctx);
      if (queryTour("next") || queryTour("feedback")) break;
      await sleep(60);
    }
    if (queryTour("feedback")) return;
    if (queryTour("next")) await tap(ctx, "next");
  }
}

async function runScript(ctx: RunCtx) {
  if (!queryTour("train-1")) {
    await tap(ctx, "go-demo");
  }
  ctx.setCaption("tourStepTrain");
  await waitFor(ctx, "train-1");
  await waitMs(ctx, ctx.pace);
  await waitFor(ctx, "car-王");
  await waitMs(ctx, ctx.pace);
  await tap(ctx, "car-王");

  if (queryTour("announce-dismiss")) {
    await tap(ctx, "announce-dismiss");
  }

  ctx.setCaption("tourStepEncounter");
  await tap(ctx, "ride-on");

  ctx.setCaption("tourStepUnderstand");
  await tap(ctx, "tap-readings");
  await tap(ctx, "place-scroll");
  await tap(ctx, "understood");

  ctx.setCaption("tourStepPractice");
  await practiceLoop(ctx);

  ctx.setCaption("tourStepArrive");
  await waitFor(ctx, "feedback");
  await waitMs(ctx, ctx.pace * 1.4);

  ctx.setCaption("tourStepBlue");
  await tap(ctx, "back-timetable");
  await waitFor(ctx, "car-王");
  await waitMs(ctx, ctx.pace);

  ctx.setCaption("tourStepEcho");
  if (queryTour("echo-右")) {
    await tap(ctx, "echo-右");
  } else {
    await tap(ctx, "car-右");
  }
  await waitFor(ctx, "echo-banner");
  await waitMs(ctx, ctx.pace * 1.6);
  if (queryTour("back-timetable")) await tap(ctx, "back-timetable");
  await waitFor(ctx, "train-1");
  ctx.setCaption("tourDone");
  ctx.setSpot(null);
}

export function AutoDemoProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [status, setStatus] = useState<TourStatus>("off");
  const [captionKey, setCaptionKey] = useState<MessageKey | null>(null);
  const [spot, setSpot] = useState<Spot | null>(null);
  const gen = useRef(0);
  const paused = useRef(false);
  const abort = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    gen.current += 1;
    paused.current = false;
    abort.current?.abort();
    abort.current = null;
    setStatus("off");
    setCaptionKey(null);
    setSpot(null);
  }, []);

  const pause = useCallback(() => {
    if (status !== "running") return;
    paused.current = true;
    setStatus("paused");
  }, [status]);

  const resume = useCallback(() => {
    if (status !== "paused") return;
    paused.current = false;
    setStatus("running");
  }, [status]);

  const start = useCallback(() => {
    if (status === "running") return;
    gen.current += 1;
    const id = gen.current;
    paused.current = false;
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    prepareDemoTour();
    setStatus("running");
    setCaptionKey("tourStepTrain");
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ctx: RunCtx = {
      signal: ac.signal,
      paused: () => paused.current,
      setCaption: (key) => {
        if (gen.current === id) setCaptionKey(key);
      },
      setSpot: (s) => {
        if (gen.current === id) setSpot(s);
      },
      pace: reduced ? 220 : 900,
    };
    void runScript(ctx)
      .then(() => {
        if (gen.current === id) setStatus("done");
      })
      .catch(() => {
        if (gen.current === id && !ac.signal.aborted) setStatus("off");
      });
  }, [status]);

  useEffect(() => () => abort.current?.abort(), []);

  const value = useMemo<AutoDemoValue>(
    () => ({
      status,
      active: status === "running" || status === "paused",
      start,
      pause,
      resume,
      stop,
    }),
    [status, start, pause, resume, stop],
  );

  return (
    <AutoDemoContext.Provider value={value}>
      {children}
      <Link
        to="/demo"
        data-tour="go-demo"
        tabIndex={-1}
        aria-hidden="true"
        className="fixed left-0 top-0 z-0 size-4 overflow-hidden opacity-0"
      >
        demo
      </Link>
      {status !== "off" ? (
        <>
          {spot && (status === "running" || status === "paused") ? (
            <div
              className="tour-spot"
              style={{
                top: spot.top,
                left: spot.left,
                width: spot.width,
                height: spot.height,
              }}
            />
          ) : null}
          <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-4">
            <div className="pointer-events-auto w-full max-w-lg rounded-lg border border-border bg-surface/95 px-4 py-3 shadow-soft backdrop-blur-sm">
              {captionKey ? (
                <p className="text-center text-sm leading-6 text-fg">{t(captionKey)}</p>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                {status === "running" ? (
                  <button
                    type="button"
                    className="inline-flex h-11 min-w-11 items-center gap-1.5 rounded-md border border-border bg-bg px-3 text-sm"
                    onClick={pause}
                  >
                    <Pause className="size-3.5" aria-hidden />
                    {t("tourPause")}
                  </button>
                ) : null}
                {status === "paused" ? (
                  <button
                    type="button"
                    className="inline-flex h-11 min-w-11 items-center gap-1.5 rounded-md bg-engine px-3 text-sm text-engine-fg"
                    onClick={resume}
                  >
                    <Play className="size-3.5" aria-hidden />
                    {t("tourResume")}
                  </button>
                ) : null}
                {status === "done" ? (
                  <button
                    type="button"
                    className="inline-flex h-11 items-center gap-1.5 rounded-md bg-engine px-3 text-sm text-engine-fg"
                    onClick={start}
                  >
                    <RotateCcw className="size-3.5" aria-hidden />
                    {t("tourReplay")}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="inline-flex h-11 items-center gap-1.5 rounded-md border border-border bg-bg px-3 text-sm"
                  onClick={stop}
                >
                  <Square className="size-3.5" aria-hidden />
                  {t("tourStop")}
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </AutoDemoContext.Provider>
  );
}

export function WatchDemoButton({
  variant = "engine",
}: {
  variant?: "engine" | "outline";
}) {
  const { t } = useI18n();
  const demo = useAutoDemo();
  return (
    <button
      type="button"
      data-tour="watch-demo"
      className={cn(
        "inline-flex h-12 items-center rounded-lg px-6 text-sm font-medium",
        variant === "engine"
          ? "bg-engine text-engine-fg hover:opacity-90"
          : "border border-border bg-surface text-fg hover:bg-bg-warm",
      )}
      onClick={() => demo.start()}
      disabled={demo.status === "running"}
    >
      {t("watchDemo")}
    </button>
  );
}
