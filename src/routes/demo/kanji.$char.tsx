import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { KanjiSession } from "@/components/kanji-session";
import { getKanji } from "@/data/kyoiku";
import {
  completeDemoEncounter,
  completeDemoUnderstand,
  DEMO_CHILD,
  demoEchoOn,
  openDemoKanji,
  recordEchoStart,
  submitDemoAnswer,
} from "@/lib/demo-progress";
import { parseGrade } from "@/lib/grade-nav";
import { PRACTICE_KINDS, type PracticeKind } from "@/lib/mastery";
import { useI18n } from "@/lib/i18n/i18n";
import type { ProgressState } from "@/lib/progress-eval";

type Search = { mode?: "play" | "look"; kind?: PracticeKind; grade?: number };

export const Route = createFileRoute("/demo/kanji/$char")({
  component: DemoKanji,
  ssr: false,
  validateSearch: (s: Record<string, unknown>): Search => ({
    mode: s.mode === "look" ? "look" : "play",
    kind: PRACTICE_KINDS.includes(s.kind as PracticeKind)
      ? (s.kind as PracticeKind)
      : undefined,
    grade: parseGrade(s.grade),
  }),
});

function DemoKanji() {
  const { t } = useI18n();
  const { char: raw } = Route.useParams();
  const char = decodeURIComponent(raw);
  const search = Route.useSearch();
  const lookMode = (search.mode ?? "play") === "look";
  const [progress, setProgress] = useState<ProgressState>(() => openDemoKanji(char));

  useEffect(() => {
    setProgress(openDemoKanji(char));
  }, [char]);

  return (
    <KanjiSession
      key={char}
      char={char}
      progress={progress}
      grade={getKanji(char)?.grade ?? DEMO_CHILD.grade}
      lookMode={lookMode}
      echoOn={!lookMode && demoEchoOn(char)}
      childId={DEMO_CHILD.id}
      childName={t("demoName")}
      hrefHome="/demo"
      onEncounter={() => setProgress(completeDemoEncounter(char))}
      onUnderstand={() => setProgress(completeDemoUnderstand(char))}
      onEchoStart={() => recordEchoStart()}
      onAnswer={async (input) => {
        const out = submitDemoAnswer({ char, ...input });
        setProgress(out.progress);
        return out;
      }}
    />
  );
}
