import { ReadingLine } from "@/components/speaker-button";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/i18n";
import { useDwell } from "@/lib/use-dwell";

export function EchoTeachStrip({
  char,
  word,
  kana,
  meaningJa,
  reading,
  skip,
  dwellMs = 1000,
  onContinue,
}: {
  char: string;
  word: string;
  kana?: string;
  meaningJa: string;
  reading: string;
  skip?: boolean;
  dwellMs?: number;
  onContinue: () => void;
}) {
  const { t } = useI18n();
  const dwell = useDwell(dwellMs, `${char}|echo-teach`, Boolean(skip));

  return (
    <section className="mt-8 space-y-5" data-echo-teach data-tour="echo-teach">
      <p className="text-center text-xs tracking-[0.2em] text-fg-subtle">{t("echoTeachLead")}</p>
      <h1 className="text-center font-display text-7xl leading-none">{char}</h1>
      <div className="rounded-lg border border-border bg-surface p-4">
        <p className="font-display text-2xl leading-none">{word}</p>
        {kana ? <p className="mt-2 text-sm text-fg-muted">{kana}</p> : null}
        <p className="mt-4 text-xs text-fg-subtle">{t("meaning")}</p>
        <p className="mt-1 text-base">{meaningJa}</p>
        <div className="mt-4">
          <p className="text-xs text-fg-subtle">{t("kindReading")}</p>
          <div className="mt-1">
            <ReadingLine text={reading} />
          </div>
        </div>
      </div>
      <Button
        type="button"
        className="h-12 w-full"
        data-tour="echo-teach-go"
        data-dwell-ready={dwell.ready ? "1" : "0"}
        disabled={!dwell.ready}
        onClick={onContinue}
      >
        {dwell.ready ? t("echoTeachGo") : `${t("echoTeachGo")} ${dwell.remainSec}`}
      </Button>
    </section>
  );
}
