import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useAutoDemo } from "@/components/auto-demo";
import { EchoTeachStrip } from "@/components/echo-teach-strip";
import { EncounterCard } from "@/components/encounter-card";
import { LineStrip } from "@/components/line-strip";
import { MasteryLights } from "@/components/mastery-lights";
import { PuzzleFrame } from "@/components/puzzle-frame";
import { QuizPanel } from "@/components/quiz-panel";
import { ReadingLine } from "@/components/speaker-button";
import { TrainAnnounce } from "@/components/train-announce";
import { Button } from "@/components/ui/button";
import { getKanji } from "@/data/kyoiku";
import { lookupReadingAudio } from "@/data/reading-audio";
import { readStoredActiveGrade } from "@/lib/active-grade";
import {
  announcementFor,
  shouldAnnounce,
  writeLastStation,
} from "@/lib/announcements";
import { echoArrivalWhen } from "@/lib/echo-arrival";
import { markEchoTaughtToday, wasEchoTaughtToday } from "@/lib/echo-teach";
import { exampleWordSurfaces, surfaceById } from "@/lib/echo-surfaces";
import { getEncounter } from "@/lib/encounters";
import { stopFixedAudio } from "@/lib/fixed-audio";
import { getGradeParams } from "@/lib/grade-params";
import { useI18n } from "@/lib/i18n/i18n";
import { STATUS_KEYS } from "@/lib/i18n/messages";
import { buildPracticeQueue, shapeSurfaceAvailable, type BankItem } from "@/lib/items";
import { lineStripFor } from "@/lib/lines";
import { STATUS_META, type PracticeKind } from "@/lib/mastery";
import {
  echoIsDue,
  echoIsStale,
  requiredLights,
  suggestBeat,
  type BeatId,
  type ProgressState,
} from "@/lib/progress-eval";
import { useDwell } from "@/lib/use-dwell";
import { cn } from "@/lib/utils";

function openingBeat(input: {
  lookMode: boolean;
  echoOn: boolean;
  progress: ProgressState;
  forceReteach: boolean;
  computed: BeatId;
}): BeatId {
  if (input.lookMode) return "understand";
  if (input.echoOn) return "echo";
  if (!input.progress.encounterCompleted) return "encounter";
  if (!input.progress.understandCompleted) return "understand";
  if (input.progress.repairRequiredKinds.length && input.forceReteach) return "understand";
  return input.computed;
}

function echoTeachSurface(char: string, progress: ProgressState) {
  const word = exampleWordSurfaces(char)[0];
  const lastId =
    progress.lastSuccessByKind.reading ?? progress.lastSuccessByKind.meaning ?? null;
  const last = lastId ? surfaceById(char, lastId) : null;
  return word ?? last;
}

export function KanjiSession({
  char,
  progress,
  grade,
  lookMode,
  echoOn,
  childId = "demo",
  childName,
  hrefHome,
  busy,
  onEncounter,
  onUnderstand,
  onAnswer,
  onEchoStart,
}: {
  char: string;
  progress: ProgressState;
  grade: number;
  lookMode: boolean;
  echoOn?: boolean;
  childId?: string;
  childName?: string;
  hrefHome: "/demo" | "/app";
  busy?: boolean;
  onEncounter: () => void | Promise<unknown>;
  onUnderstand: () => void | Promise<unknown>;
  onAnswer: (input: {
    itemId: string;
    choiceId: string;
    isEcho: boolean;
    echoBatchDone: boolean;
    sessionId: string;
  }) => Promise<{ correct: boolean; label: string; progress: ProgressState }>;
  onEchoStart?: () => void;
}) {
  const { t } = useI18n();
  const tour = useAutoDemo();
  const kanji = getKanji(char);
  const params = getGradeParams(grade);
  const shape = shapeSurfaceAvailable(char);
  const now = new Date().toISOString();
  const skipTeach = lookMode || tour.active;
  const computed: BeatId = lookMode
    ? "understand"
    : echoOn
      ? "echo"
      : suggestBeat(progress, params, shape, now, 99);
  const [localBeat, setLocalBeat] = useState<BeatId>(() =>
    openingBeat({
      lookMode,
      echoOn: Boolean(echoOn),
      progress,
      forceReteach: params.force_reteach_on_wrong,
      computed,
    }),
  );
  const [readingsOpen, setReadingsOpen] = useState(progress.understandCompleted);
  const [placed, setPlaced] = useState(progress.understandCompleted);
  const [heard, setHeard] = useState(false);
  const [readingsAcked, setReadingsAcked] = useState(false);
  const [echoTeachDismissed, setEchoTeachDismissed] = useState(false);
  const [items, setItems] = useState<BankItem[]>([]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<{ correct: boolean; label: string } | null>(null);
  const [sessionId] = useState(() =>
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `s-${Date.now()}`,
  );
  const [repairCount, setRepairCount] = useState(0);
  const [lastWrongByKind, setLastWrongByKind] = useState<Partial<Record<PracticeKind, string>>>(
    {},
  );
  const echoArmed = useRef(false);
  const itemsArmed = useRef(false);
  const answering = useRef(false);
  const afterReteach = useRef<BeatId>("practice");
  const echoDue = echoIsDue(progress, now);
  const staleEcho = echoIsStale(progress, now, params);
  const [announce, setAnnounce] = useState<ReturnType<typeof announcementFor> | null>(() =>
    typeof window === "undefined"
      ? null
      : shouldAnnounce(char, { lookMode, echoOn: Boolean(echoOn), echoDue, demoActive: tour.active })
        ? announcementFor(char)
        : null,
  );
  const lineView = lineStripFor(char, grade);
  const encounterDwell = useDwell(
    params.encounter_min_ms,
    `${char}|encounter`,
    skipTeach || localBeat !== "encounter",
  );
  const understandDwell = useDwell(
    params.understand_min_ms,
    `${char}|understand|${progress.repairRequiredKinds.join(",")}`,
    skipTeach || (localBeat !== "understand" && !lookMode),
  );

  useEffect(() => {
    if (shouldAnnounce(char, { lookMode, echoOn: Boolean(echoOn), echoDue, demoActive: tour.active })) {
      setAnnounce(announcementFor(char));
    } else {
      setAnnounce(null);
    }
  }, [char, lookMode, echoOn, echoDue, tour.active]);

  useEffect(() => {
    return () => stopFixedAudio();
  }, [char, localBeat]);

  useEffect(() => {
    echoArmed.current = false;
    itemsArmed.current = false;
    answering.current = false;
    afterReteach.current = echoOn ? "echo" : "practice";
    setReadingsOpen(progress.understandCompleted);
    setPlaced(progress.understandCompleted);
    setHeard(false);
    setReadingsAcked(false);
    setEchoTeachDismissed(false);
    setItems([]);
    setIndex(0);
    setSelected(null);
    setResult(null);
    setRepairCount(0);
    setLastWrongByKind({});
    setLocalBeat(
      openingBeat({
        lookMode,
        echoOn: Boolean(echoOn),
        progress,
        forceReteach: params.force_reteach_on_wrong,
        computed,
      }),
    );
    // reset only when the car changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [char]);

  const echoNow = !lookMode && localBeat === "echo";
  const teachSurface = echoTeachSurface(char, progress);
  const showEchoTeach =
    echoNow &&
    Boolean(teachSurface) &&
    !skipTeach &&
    !echoTeachDismissed &&
    (staleEcho || !wasEchoTaughtToday(char, now));
  useEffect(() => {
    if (lookMode) return;
    if (localBeat !== "practice" && localBeat !== "echo") return;
    if (itemsArmed.current && items.length > 0) return;
    const mode = localBeat === "echo" ? "echo" : "session";
    const kinds = requiredLights(params, shape);
    const ask =
      mode === "echo"
        ? kinds
        : kinds.filter(
            (k) => !progress.lights[k] || progress.repairRequiredKinds.includes(k),
          );
    const drawn = buildPracticeQueue({
      kanji: char,
      kinds: ask.length ? ask : kinds,
      seed: `${childId}|${char}|${mode}|${repairCount}`,
      maxPerKind: params.max_items_per_kind_per_session,
      maxTotal:
        mode === "echo"
          ? kinds.length * params.echo_items_per_light
          : params.max_items_per_session,
      echo:
        mode === "echo"
          ? { lastSuccessByKind: progress.lastSuccessByKind, seenIds: progress.surfacesSeenSuccess }
          : undefined,
      extras: mode === "session",
      phoneticFamily: mode === "session" && params.phonetic_family_enabled,
      excludeIds: Object.values(lastWrongByKind).filter((id): id is string => Boolean(id)),
    });
    if (drawn.length === 0) {
      setLocalBeat("feedback");
      return;
    }
    setItems(drawn);
    setIndex(0);
    setSelected(null);
    setResult(null);
    itemsArmed.current = true;
    if (mode === "echo" && !echoArmed.current) {
      echoArmed.current = true;
      onEchoStart?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localBeat, char, lookMode, repairCount]);

  const item = items[index] ?? null;

  if (!kanji) {
    return (
      <AppShell>
        <main className="mx-auto max-w-lg px-5 py-16 text-center">
          <p>{t("notInList")}</p>
          <Link to={hrefHome} className="mt-4 inline-block underline">
            {t("backTimetable")}
          </Link>
        </main>
      </AppShell>
    );
  }

  const status = progress.status;
  const exampleWord = exampleWordSurfaces(kanji.char)[0];
  const canFinishUnderstand =
    (!params.reading_enabled || readingsOpen) &&
    (!params.shape_enabled || !shape || placed);
  const onYomi = kanji.elementaryReadings.onyomi;
  const kunYomi = kanji.elementaryReadings.kunyomi;
  const audioAvailable = [...onYomi, ...kunYomi].some((r) => Boolean(lookupReadingAudio(r)));
  const needsListen =
    !skipTeach && params.reading_enabled && !progress.understandCompleted;
  const listenOk = !needsListen || (audioAvailable ? heard : readingsAcked);
  const rideReady = encounterDwell.ready && !busy;
  const understandReady =
    understandDwell.ready && canFinishUnderstand && listenOk && !busy;
  const arrivalWhen = progress.echoDueAt
    ? echoArrivalWhen(progress.echoDueAt, now, t)
    : "";

  return (
    <AppShell childName={childName} grade={grade}>
      {announce && localBeat !== "echo" ? (
        <TrainAnnounce
          announcement={announce}
          onPass={() => {
            writeLastStation(char);
            setAnnounce(null);
          }}
        />
      ) : null}
      <main className="mx-auto max-w-lg px-5 py-8">
        <div className="flex items-center justify-between text-sm">
          <Link
            to={hrefHome}
            search={{ grade: readStoredActiveGrade() ?? kanji.grade }}
            data-tour="back-timetable"
            className="text-fg-muted hover:text-fg"
          >
            ← {t("backTimetable")}
          </Link>
          <span className={cn("rounded-full px-2.5 py-1 text-xs", STATUS_META[status].className)}>
            {t(STATUS_KEYS[status])}
          </span>
        </div>

        {lineView ? (
          <div className="mt-5">
            <LineStrip view={lineView} />
          </div>
        ) : null}

        <p
          className="mt-6 text-center text-xs tracking-[0.28em] text-fg-subtle"
          data-tour={localBeat === "echo" ? "echo-banner" : undefined}
          data-echo-teach={showEchoTeach ? "1" : "0"}
        >
          {t(
            localBeat === "echo"
              ? progress.echoSuccessCount >= 1
                ? "echoBannerRound"
                : "echoBanner"
              : localBeat === "encounter"
                ? "beatEncounter"
                : localBeat === "understand"
                  ? "beatUnderstand"
                  : localBeat === "practice"
                    ? "beatPractice"
                    : "beatFeedback",
            localBeat === "echo" && progress.echoSuccessCount >= 1
              ? { n: progress.echoSuccessCount + 1 }
              : undefined,
          )}
        </p>

        {localBeat === "encounter" && !lookMode ? (
          <section>
            <EncounterCard
              char={kanji.char}
              encounter={getEncounter(kanji.char)}
              strokesLabel={t("strokes", { grade: kanji.grade, n: kanji.strokes })}
            />
            <div className="mt-10 text-center">
              <Button
                type="button"
                className="h-12 min-w-40"
                data-tour="ride-on"
                data-dwell-ready={encounterDwell.ready ? "1" : "0"}
                disabled={!rideReady}
                onClick={() => {
                  void Promise.resolve(onEncounter()).then(() => setLocalBeat("understand"));
                }}
              >
                {encounterDwell.ready
                  ? t("rideOn")
                  : `${t("rideOn")} ${encounterDwell.remainSec}`}
              </Button>
            </div>
          </section>
        ) : null}

        {(localBeat === "understand" || lookMode) &&
        localBeat !== "practice" &&
        localBeat !== "echo" ? (
          <section className="mt-8 space-y-5">
            {progress.repairRequiredKinds.length > 0 ? (
              <p className="text-center text-sm text-fg-muted">{t("reteachLead")}</p>
            ) : null}
            <div className="text-center">
              <h1 className="font-display text-7xl leading-none">{kanji.char}</h1>
              <p className="mt-4 text-sm text-fg-muted">{kanji.imagery}</p>
            </div>
            <div className="rounded-lg border border-border bg-surface p-4">
              <p className="text-xs text-fg-subtle">{t("meaning")}</p>
              <p className="mt-1 text-base">{kanji.meaningJa}</p>
              {exampleWord ? (
                <p className="mt-3 text-sm text-fg-muted">
                  <span className="font-display text-lg text-fg">{exampleWord.text}</span>
                  {exampleWord.kana ? <span className="ml-2">{exampleWord.kana}</span> : null}
                </p>
              ) : null}
            </div>
            {params.reading_enabled ? (
              readingsOpen ? (
                <div className="grid gap-3 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2">
                  <div data-tour="tap-readings">
                    <p className="text-xs text-fg-subtle">{t("onYomi")}</p>
                    <div className="mt-2 space-y-1">
                      {onYomi.length ? (
                        onYomi.map((r) => (
                          <ReadingLine key={`on-${r}`} text={r} onHeard={() => setHeard(true)} />
                        ))
                      ) : (
                        <p className="font-display text-xl text-fg-muted">—</p>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-fg-subtle">{t("kunYomi")}</p>
                    <div className="mt-2 space-y-1">
                      {kunYomi.length ? (
                        kunYomi.map((r) => (
                          <ReadingLine key={`kun-${r}`} text={r} onHeard={() => setHeard(true)} />
                        ))
                      ) : (
                        <p className="font-display text-xl text-fg-muted">—</p>
                      )}
                    </div>
                  </div>
                  {needsListen && !audioAvailable && !readingsAcked ? (
                    <div className="sm:col-span-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        data-tour="readings-ack"
                        onClick={() => setReadingsAcked(true)}
                      >
                        {t("readingsAck")}
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <button
                  type="button"
                  data-tour="tap-readings"
                  className="grid w-full grid-cols-2 gap-3 rounded-lg border border-border bg-surface p-4 text-left"
                  onClick={() => setReadingsOpen(true)}
                >
                  <span>
                    <span className="block text-xs text-fg-subtle">{t("onYomi")}</span>
                    <span className="mt-1 block font-display text-xl">{t("readingsHidden")}</span>
                  </span>
                  <span>
                    <span className="block text-xs text-fg-subtle">{t("kunYomi")}</span>
                    <span className="mt-1 block font-display text-xl">{t("tapReadings")}</span>
                  </span>
                </button>
              )
            ) : null}
            {params.shape_enabled && shape ? (
              <div className="space-y-3">
                <PuzzleFrame imagery={kanji.imagery} filled={placed ? kanji.char : undefined} />
                {!placed ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    data-tour="place-scroll"
                    onClick={() => setPlaced(true)}
                  >
                    {t("placeOnScroll")}
                  </Button>
                ) : null}
              </div>
            ) : null}
            {lookMode ? (
              <p className="text-center text-sm text-fg-subtle">{t("lookModeHint")}</p>
            ) : (
              <>
                <p className="text-center text-xs text-fg-subtle">{t("understandWriteHint")}</p>
                {needsListen && audioAvailable && !heard ? (
                  <p className="text-center text-xs text-fg-subtle">{t("listenOnce")}</p>
                ) : null}
                <Button
                  type="button"
                  className="h-12 w-full"
                  data-tour="understood"
                  data-dwell-ready={understandReady ? "1" : "0"}
                  disabled={!understandReady}
                  onClick={() => {
                    const nextBeat = afterReteach.current;
                    if (progress.understandCompleted) {
                      setLocalBeat(nextBeat);
                      return;
                    }
                    void Promise.resolve(onUnderstand()).then(() => {
                      setLocalBeat("practice");
                    });
                  }}
                >
                  {understandDwell.ready
                    ? t("understood")
                    : `${t("understood")} ${understandDwell.remainSec}`}
                </Button>
              </>
            )}
          </section>
        ) : null}

        {showEchoTeach && teachSurface ? (
          <EchoTeachStrip
            char={kanji.char}
            word={teachSurface.text}
            kana={teachSurface.kana}
            meaningJa={teachSurface.meaningJa || kanji.meaningJa}
            reading={teachSurface.reading}
            skip={skipTeach}
            onContinue={() => {
              markEchoTaughtToday(kanji.char, now);
              setEchoTeachDismissed(true);
            }}
          />
        ) : null}

        {(localBeat === "practice" || localBeat === "echo") &&
        item &&
        !lookMode &&
        !showEchoTeach ? (
          <section className="mt-8">
            <QuizPanel
              quiz={item.payload}
              selected={selected}
              result={result}
              busy={Boolean(busy)}
              childGrade={grade}
              onSelect={setSelected}
              onSubmit={() => {
                if (!selected) return;
                const last = index === items.length - 1;
                const echoBatchDone = echoNow && last;
                void onAnswer({
                  itemId: item.id,
                  choiceId: selected,
                  isEcho: echoNow,
                  echoBatchDone,
                  sessionId,
                }).then((out) => {
                  setResult({ correct: out.correct, label: out.label });
                  if (!out.correct) {
                    setLastWrongByKind((prev) => ({ ...prev, [item.kind]: item.id }));
                    setRepairCount((c) => c + 1);
                  }
                });
              }}
              onCommit={(choiceId) => {
                if (result || busy || answering.current) return;
                answering.current = true;
                setSelected(choiceId);
                const last = index === items.length - 1;
                const echoBatchDone = echoNow && last;
                void onAnswer({
                  itemId: item.id,
                  choiceId,
                  isEcho: echoNow,
                  echoBatchDone,
                  sessionId,
                })
                  .then((out) => {
                    setResult({ correct: out.correct, label: out.label });
                    if (!out.correct) {
                      setLastWrongByKind((prev) => ({ ...prev, [item.kind]: item.id }));
                      setRepairCount((c) => c + 1);
                    }
                  })
                  .finally(() => {
                    answering.current = false;
                  });
              }}
              onNext={() => {
                const more = index + 1 < items.length;
                const wrong = Boolean(result && !result.correct);
                afterReteach.current = more
                  ? echoNow
                    ? "echo"
                    : "practice"
                  : "feedback";
                if (more) {
                  setIndex(index + 1);
                  setSelected(null);
                  setResult(null);
                }
                if (wrong && params.force_reteach_on_wrong) {
                  setLocalBeat("understand");
                  return;
                }
                if (!more) setLocalBeat("feedback");
              }}
            />
          </section>
        ) : null}

        {localBeat === "feedback" && !lookMode ? (
          <section className="mt-10 space-y-6 text-center" data-tour="feedback">
            <h1 className="font-display text-7xl leading-none">{kanji.char}</h1>
            <MasteryLights lights={progress.lights} ui={params.lights_ui} />
            <p className="text-sm leading-7 text-fg-muted">
              {status === "perfect"
                ? t("feedbackPerfect")
                : status === "almost" && progress.echoSuccessCount >= 1
                  ? t("feedbackAlmostEcho")
                  : status === "almost"
                    ? t("feedbackAlmost")
                    : status === "lost"
                      ? t("feedbackLost")
                      : t("feedbackFix")}
            </p>
            {status === "almost" && progress.echoDueAt ? (
              <p className="text-xs text-fg-subtle" data-echo-arrival={kanji.char}>
                {t("echoArrival", { when: arrivalWhen })}
              </p>
            ) : null}
            {status !== "perfect" && status !== "almost" ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  itemsArmed.current = false;
                  afterReteach.current = "practice";
                  setLocalBeat(
                    progress.repairRequiredKinds.length && params.force_reteach_on_wrong
                      ? "understand"
                      : "practice",
                  );
                }}
              >
                {t("continuePractice")}
              </Button>
            ) : null}
            <p>
              <Link to={hrefHome} className="text-sm text-fg-muted underline-offset-4 hover:underline">
                {t("backTimetable")}
              </Link>
            </p>
          </section>
        ) : null}

        {localBeat !== "encounter" && localBeat !== "feedback" ? (
          <div className="mt-10">
            <MasteryLights lights={progress.lights} ui={params.lights_ui} />
          </div>
        ) : null}
      </main>
    </AppShell>
  );
}
