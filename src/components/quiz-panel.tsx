import { PuzzleFrame } from "@/components/puzzle-frame";
import { ComponentAssemblyBoard } from "@/components/component-assembly";
import { PhoneticWorkshopBoard, memberFromMeta } from "@/components/phonetic-workshop";
import { StrokeAssemblyBoard } from "@/components/stroke-assembly";
import { Button } from "@/components/ui/button";
import { familyById } from "@/lib/phonetic-family";
import type { Quiz } from "@/lib/quiz";
import { useI18n } from "@/lib/i18n/i18n";
import type { PracticeKind } from "@/lib/mastery";
import { COMPONENT_COMPLETE_ID, COMPONENT_SKIP_ID } from "@/lib/component-assembly";
import { STROKE_COMPLETE_ID, STROKE_SKIP_ID } from "@/lib/stroke-assembly";
import { SpeakerButton } from "@/components/speaker-button";
import { structureConfirm } from "@/lib/shape-copy";
import { cn } from "@/lib/utils";

const KIND_PROMPT = {
  reading: "quizReading",
  meaning: "quizMeaning",
  shape: "quizShape",
} as const;

const KIND_LABEL = {
  reading: "kindReading",
  meaning: "kindMeaning",
  shape: "kindShape",
} as const;

export function QuizPanel({
  quiz,
  selected,
  result,
  busy,
  onSelect,
  onSubmit,
  onCommit,
  onNext,
  childGrade,
}: {
  quiz: Quiz;
  selected: string | null;
  result: { correct: boolean; label: string } | null;
  busy: boolean;
  onSelect: (id: string) => void;
  onSubmit: () => void;
  onCommit?: (choiceId: string) => void;
  onNext?: () => void;
  childGrade?: number;
}) {
  const { t } = useI18n();
  const kind = quiz.kind as PracticeKind;
  const stroke = quiz.kind === "shape" ? quiz.strokeAssembly : undefined;
  const component = quiz.kind === "shape" ? quiz.componentAssembly : undefined;
  const familyMeta = quiz.phoneticFamily;
  const family = familyMeta ? familyById(familyMeta.familyId) : null;

  if (family && familyMeta) {
    const member =
      familyMeta.composed === family.phonetic.kanji ? null : memberFromMeta(familyMeta);
    return (
      <div className="space-y-6">
        <p className="text-center text-xs tracking-[0.2em] text-fg-subtle">{t("workshopKicker")}</p>
        <PhoneticWorkshopBoard
          family={family}
          member={member}
          childGrade={childGrade ?? 1}
          locked={busy || Boolean(result)}
          onCommit={(choiceId) => onCommit?.(choiceId)}
        />
        {result && onNext ? (
          <div className="text-center">
            <Button type="button" data-tour="next" onClick={onNext}>
              {t("next")}
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  if (quiz.cloze) {
    const parts = quiz.cloze.frame_ja.split("___");
    return (
      <div className="space-y-6">
        <p className="text-center text-xs tracking-[0.2em] text-fg-subtle">{t("clozeKicker")}</p>
        <p className="text-center font-medium leading-relaxed">
          {parts[0]}
          <span className="mx-1 inline-block min-w-10 border-b-2 border-fg px-2 text-center font-display text-2xl leading-none">
            {result ? quiz.cloze.answer : "　"}
          </span>
          {parts.slice(1).join("___")}
        </p>
        <div className={cn("grid gap-3", quiz.choices.length > 2 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2")}>
          {quiz.choices.map((c) => {
            const isPick = selected === c.id;
            const show = Boolean(result);
            const good = show && c.correct;
            const bad = show && isPick && !c.correct;
            return (
              <button
                key={c.id}
                type="button"
                data-tour={c.correct ? "choice-correct" : "choice-decoy"}
                disabled={busy || Boolean(result)}
                onClick={() => {
                  if (onCommit) onCommit(c.id);
                  else onSelect(c.id);
                }}
                className={cn(
                  "flex min-h-24 flex-col items-center justify-center rounded-lg border px-3 py-5 transition-[background-color,border-color] duration-150",
                  isPick && !show && "border-fg bg-fg text-bg",
                  !isPick && !show && "border-border bg-surface hover:bg-bg-warm",
                  good && "border-status-perfect bg-status-perfect text-status-perfect-fg",
                  bad && "border-status-lost bg-status-lost text-status-lost-fg",
                  show && !good && !bad && "opacity-50",
                )}
              >
                <span className="font-display text-5xl leading-none">{c.label}</span>
              </button>
            );
          })}
        </div>
        {result ? (
          <div className="space-y-3 text-center">
            <p className="text-sm text-fg-muted">
              {result.correct ? t("clozeRight") : t("clozeWrong")}
            </p>
            {onNext ? (
              <Button type="button" data-tour="next" onClick={onNext}>
                {t("next")}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  if (quiz.confusable) {
    return (
      <div className="space-y-6">
        <p className="text-center text-xs tracking-[0.2em] text-fg-subtle">{t("confuseKicker")}</p>
        <p className="text-center font-medium">{quiz.confusable.prompt_ja}</p>
        <div className="grid grid-cols-2 gap-3">
          {quiz.choices.map((c) => {
            const isPick = selected === c.id;
            const show = Boolean(result);
            const good = show && c.correct;
            const bad = show && isPick && !c.correct;
            return (
              <button
                key={c.id}
                type="button"
                data-tour={c.correct ? "choice-correct" : "choice-decoy"}
                disabled={busy || Boolean(result)}
                onClick={() => {
                  if (onCommit) onCommit(c.id);
                  else onSelect(c.id);
                }}
                className={cn(
                  "flex min-h-32 flex-col items-center justify-center rounded-lg border px-3 py-6 transition-[background-color,border-color] duration-150",
                  isPick && !show && "border-fg bg-fg text-bg",
                  !isPick && !show && "border-border bg-surface hover:bg-bg-warm",
                  good && "border-status-perfect bg-status-perfect text-status-perfect-fg",
                  bad && "border-status-lost bg-status-lost text-status-lost-fg",
                  show && !good && !bad && "opacity-50",
                )}
              >
                <span className="font-display text-6xl leading-none">{c.label}</span>
                <span className="mt-3 text-xs tracking-[0.18em] text-current/70">駅</span>
              </button>
            );
          })}
        </div>
        {result ? (
          <div className="space-y-3 text-center">
            <p className="text-sm text-fg-muted">
              {result.correct ? t("confuseRight") : t("confuseWrong")}
            </p>
            {onNext ? (
              <Button type="button" data-tour="next" onClick={onNext}>
                {t("next")}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  if (component) {
    return (
      <div className="space-y-6">
        <ComponentAssemblyBoard
          data={component}
          locked={busy || Boolean(result)}
          onComplete={() => onCommit?.(COMPONENT_COMPLETE_ID)}
          onSkip={() => onCommit?.(COMPONENT_SKIP_ID)}
        />
        {result ? (
          <div className="space-y-3 text-center">
            {result.correct && structureConfirm(quiz.glyph) ? (
              <p className="text-sm text-fg" data-shape-confirm>
                {structureConfirm(quiz.glyph)}
              </p>
            ) : null}
            <p className="text-sm text-fg-muted">
              {result.correct
                ? t("quizCorrect", { kanji: quiz.glyph, label: result.label })
                : t("strokeGiveUp")}
            </p>
            {onNext ? (
              <Button type="button" data-tour="next" onClick={onNext}>
                {t("next")}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  if (stroke) {
    return (
      <div className="space-y-6">
        <StrokeAssemblyBoard
          data={stroke}
          locked={busy || Boolean(result)}
          onComplete={() => onCommit?.(STROKE_COMPLETE_ID)}
          onSkip={() => onCommit?.(STROKE_SKIP_ID)}
        />
        {result ? (
          <div className="space-y-3 text-center">
            {result.correct && structureConfirm(quiz.glyph) ? (
              <p className="text-sm text-fg" data-shape-confirm>
                {structureConfirm(quiz.glyph)}
              </p>
            ) : null}
            <p className="text-sm text-fg-muted">
              {result.correct
                ? t("quizCorrect", { kanji: quiz.glyph, label: result.label })
                : t("strokeGiveUp")}
            </p>
            {onNext ? (
              <Button type="button" data-tour="next" onClick={onNext}>
                {t("next")}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {quiz.kind === "shape" ? (
        <PuzzleFrame imagery={quiz.imagery} filled={result?.correct ? quiz.choices.find((c) => c.correct)?.label : undefined} />
      ) : (
        <div className="text-center">
          <p className="text-xs tracking-[0.2em] text-fg-subtle">{t(KIND_LABEL[kind])}</p>
          {quiz.surface && quiz.surface.text !== quiz.glyph ? (
            <p className="mt-4 font-display text-5xl leading-none text-fg">
              {quiz.surface.text.split("").map((ch, i) => (
                <span key={`${ch}-${i}`} className={ch === quiz.glyph ? "text-engine" : undefined}>
                  {ch}
                </span>
              ))}
            </p>
          ) : (
            <p className="mt-4 font-display text-7xl leading-none text-fg">{quiz.glyph}</p>
          )}
          {quiz.surface?.kana ? (
            <p className="mt-2 flex items-center justify-center gap-2 text-sm text-fg-muted">
              <span>{quiz.surface.kana}</span>
              <SpeakerButton text={quiz.surface.reading || quiz.surface.kana} />
            </p>
          ) : quiz.kind === "reading" && quiz.surface?.reading ? (
            <div className="mt-2 flex justify-center">
              <SpeakerButton text={quiz.surface.reading} />
            </div>
          ) : null}
          {quiz.surface?.frame ? (
            <p className="mt-1 text-sm text-fg-subtle">{quiz.surface.frame}</p>
          ) : null}
        </div>
      )}
      <p className="text-center font-medium">
        {quiz.surface && quiz.surface.text !== quiz.glyph && kind !== "shape"
          ? t(kind === "reading" ? "quizReadingWord" : "quizMeaningWord", { kanji: quiz.glyph })
          : t(KIND_PROMPT[kind])}
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {quiz.choices.map((c) => {
          const isPick = selected === c.id;
          const show = Boolean(result);
          const good = show && c.correct;
          const bad = show && isPick && !c.correct;
          const showSpeaker = quiz.kind === "reading";
          return (
            <div
              key={c.id}
              className={cn(
                "flex min-h-12 items-stretch rounded-lg border transition-[background-color,border-color] duration-150",
                isPick && !show && "border-fg bg-fg text-bg",
                !isPick && !show && "border-border bg-surface",
                good && "border-status-perfect bg-status-perfect text-status-perfect-fg",
                bad && "border-status-lost bg-status-lost text-status-lost-fg",
                show && !good && !bad && "opacity-50",
              )}
            >
              <button
                type="button"
                data-tour={c.correct ? "choice-correct" : undefined}
                disabled={busy || Boolean(result)}
                onClick={() => onSelect(c.id)}
                className={cn(
                  "min-h-12 min-w-0 flex-1 px-3 py-3 text-left font-display text-lg",
                  !isPick && !show && "hover:bg-bg-warm",
                )}
              >
                {c.label}
              </button>
              {showSpeaker ? (
                <div className="grid shrink-0 place-items-center pr-1">
                  <SpeakerButton text={c.label} />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {result ? (
        <div className="space-y-3 text-center">
          <p className="text-sm text-fg-muted">
            {result.correct
              ? t("quizCorrect", { kanji: quiz.glyph, label: result.label })
              : t("quizWrong", { label: result.label })}
          </p>
          {onNext ? (
            <Button type="button" data-tour="next" onClick={onNext}>
              {t("next")}
            </Button>
          ) : null}
        </div>
      ) : (
        <Button
          type="button"
          className="w-full"
          data-tour="check"
          disabled={!selected || busy}
          onClick={onSubmit}
        >
          {busy ? t("checking") : t("checkAnswer")}
        </Button>
      )}
    </div>
  );
}
