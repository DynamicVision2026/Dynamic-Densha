import { EngineCar, KanjiCar } from "@/components/kanji-car";
import { echoArrivalWhen } from "@/lib/echo-arrival";
import { useI18n } from "@/lib/i18n/i18n";
import type { Grade } from "@/data/kyoiku";
import type { TrainView } from "@/lib/server/progress";

export function TrainTrack({
  train,
  childId,
  mode,
  hrefBase = "/app",
  grade,
}: {
  train: TrainView;
  childId: string;
  mode: "play" | "look";
  hrefBase?: "/app" | "/demo";
  grade?: Grade;
}) {
  const { t } = useI18n();
  const now = new Date().toISOString();
  return (
    <section className="space-y-3" data-tour={train.index === 1 ? "train-1" : undefined}>
      <div className="flex items-baseline justify-between gap-3 px-1">
        <h2 className="font-display text-lg text-fg">
          {t("trainN", { n: train.index })}
          <span className="ml-2 font-sans text-sm font-normal text-fg-muted">
            → {train.dest}
          </span>
        </h2>
        <p className="text-xs text-fg-subtle tabular-nums">
          {train.cleared ? t("arrived") : t("running")}
        </p>
      </div>
      <div className="relative min-w-0 overflow-x-auto pb-2">
        <div className="track-line absolute inset-x-0 top-[2.25rem] h-px" />
        <div className="relative flex items-end gap-1.5 px-1">
          <EngineCar index={train.index} />
          {train.cars.map((car) => {
            const arrival =
              car.status === "almost" && car.echoDueAt
                ? echoArrivalWhen(car.echoDueAt, now, t)
                : undefined;
            return (
              <KanjiCar
                key={car.char}
                char={car.char}
                status={car.status}
                to={`${hrefBase}/kanji/${encodeURIComponent(car.char)}`}
                search={{
                  child: childId,
                  mode,
                  ...(grade ? { grade: String(grade) } : {}),
                }}
                echoDue={car.echoDue}
                arrival={arrival}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}
