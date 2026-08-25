import { ReadingLine } from "@/components/speaker-button";
import { useI18n } from "@/lib/i18n/i18n";

/** Echo re-teach content only. Primary ためす lives in RideShell action. */
export function EchoTeachStrip({
  char,
  word,
  kana,
  meaningJa,
  reading,
}: {
  char: string;
  word: string;
  kana?: string;
  meaningJa: string;
  reading: string;
}) {
  const { t } = useI18n();

  return (
    <section
      className="flex min-h-0 flex-1 flex-col justify-center gap-5 overflow-hidden"
      data-echo-teach
      data-tour="echo-teach"
    >
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
    </section>
  );
}
