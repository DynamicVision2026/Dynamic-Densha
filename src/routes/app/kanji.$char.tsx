import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KanjiSession } from "@/components/kanji-session";
import { AppShell } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { getKanji } from "@/data/kyoiku";
import { readActiveChildId } from "@/lib/active-child";
import { parseGrade } from "@/lib/grade-nav";
import { PRACTICE_KINDS, type PracticeKind } from "@/lib/mastery";
import {
  completeEncounter,
  completeUnderstand,
  getKanjiStudy,
  submitPractice,
} from "@/lib/server/progress";

type Search = { child?: string; mode?: "play" | "look"; kind?: PracticeKind; grade?: number };

export const Route = createFileRoute("/app/kanji/$char")({
  component: KanjiStudy,
  validateSearch: (s: Record<string, unknown>): Search => ({
    child: typeof s.child === "string" ? s.child : undefined,
    mode: s.mode === "look" ? "look" : "play",
    kind: PRACTICE_KINDS.includes(s.kind as PracticeKind)
      ? (s.kind as PracticeKind)
      : undefined,
    grade: parseGrade(s.grade),
  }),
});

function KanjiStudy() {
  const { char: raw } = Route.useParams();
  const char = decodeURIComponent(raw);
  const search = Route.useSearch();
  const childId = search.child || readActiveChildId() || "";
  const lookMode = (search.mode ?? "play") === "look";
  const qc = useQueryClient();

  const studyQ = useQuery({
    queryKey: ["study", childId, char],
    queryFn: () => getKanjiStudy({ data: { childId, char } }),
    enabled: Boolean(childId),
  });

  const encounter = useMutation({
    mutationFn: () => completeEncounter({ data: { childId, char } }),
    onSuccess: (out) => {
      void qc.setQueryData(["study", childId, char], (prev: typeof studyQ.data) =>
        prev ? { ...prev, progress: out.progress } : prev,
      );
    },
  });
  const understand = useMutation({
    mutationFn: () => completeUnderstand({ data: { childId, char } }),
    onSuccess: (out) => {
      void qc.setQueryData(["study", childId, char], (prev: typeof studyQ.data) =>
        prev ? { ...prev, progress: out.progress } : prev,
      );
    },
  });

  if (!childId || studyQ.isLoading || !studyQ.data) {
    return (
      <AppShell>
        <div className="mx-auto max-w-lg px-5 py-16">
          <Skeleton className="h-80 w-full rounded-xl" />
        </div>
      </AppShell>
    );
  }

  const study = studyQ.data;

  return (
    <KanjiSession
      key={char}
      char={char}
      progress={study.progress}
      grade={getKanji(char)?.grade ?? study.child.grade}
      lookMode={lookMode}
      echoOn={!lookMode && study.echoOn}
      childId={childId}
      childName={study.child.name}
      hrefHome="/app"
      busy={encounter.isPending || understand.isPending}
      onEncounter={() => encounter.mutateAsync()}
      onUnderstand={() => understand.mutateAsync()}
      onAnswer={async (input) => {
        const out = await submitPractice({
          data: {
            childId,
            char,
            ...input,
          },
        });
        await qc.invalidateQueries({ queryKey: ["study", childId, char] });
        await qc.invalidateQueries({ queryKey: ["home", childId] });
        return out;
      }}
    />
  );
}
