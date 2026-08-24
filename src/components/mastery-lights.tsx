import type { Lights } from "@/lib/progress-eval";
import type { LightsUi } from "@/lib/grade-params";
import { useI18n } from "@/lib/i18n/i18n";
import { cn } from "@/lib/utils";

const ORDER = ["reading", "meaning", "shape"] as const;
const LABELS = {
  reading: "kindReading",
  meaning: "kindMeaning",
  shape: "kindShape",
} as const;

export function MasteryLights({
  lights,
  ui = "stars",
}: {
  lights: Lights;
  ui?: LightsUi;
}) {
  const { t } = useI18n();
  return (
    <ul className="flex items-center justify-center gap-4" aria-label={t("lightsTitle")}>
      {ORDER.map((k) => {
        const on = lights[k];
        return (
          <li key={k} className="flex flex-col items-center gap-1">
            <span
              className={cn(
                "grid size-5 place-items-center text-base leading-none",
                ui === "stars"
                  ? on
                    ? "text-engine"
                    : "text-fg-subtle"
                  : cn(
                      "size-3.5 rounded-full",
                      on ? "bg-engine" : "border border-border bg-surface",
                    ),
              )}
              aria-hidden="true"
            >
              {ui === "stars" ? (on ? "★" : "☆") : null}
            </span>
            <span className={cn("text-[11px]", on ? "text-fg" : "text-fg-subtle")}>
              {t(LABELS[k])}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
