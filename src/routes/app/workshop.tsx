import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { PhoneticWorkshopBoard } from "@/components/phonetic-workshop";
import { Skeleton } from "@/components/ui/skeleton";
import { PHONETIC_FAMILIES } from "@/data/phonetic-families";
import { readActiveChildId, writeActiveChildId } from "@/lib/active-child";
import { resolveActiveGrade, usePersistActiveGrade } from "@/lib/active-grade";
import { listChildren } from "@/lib/server/children";
import { type Grade } from "@/data/kyoiku";
import { useI18n } from "@/lib/i18n/i18n";
import { workshopSearchFrom } from "@/lib/grade-nav";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/workshop")({
  component: AppWorkshop,
  validateSearch: workshopSearchFrom,
});

function familyIdFromSearch(raw: string | undefined): string {
  if (raw && PHONETIC_FAMILIES.some((f) => f.id === raw)) return raw;
  return PHONETIC_FAMILIES[0]!.id;
}

function AppWorkshop() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [childId, setChildId] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [familyId, setFamilyId] = useState(() => familyIdFromSearch(search.family));
  const family = PHONETIC_FAMILIES.find((f) => f.id === familyId) ?? PHONETIC_FAMILIES[0]!;

  const childrenQ = useQuery({
    queryKey: ["children"],
    queryFn: () => listChildren(),
  });

  useEffect(() => {
    if (!childrenQ.data) return;
    if (childrenQ.data.length === 0) {
      void navigate({ to: "/onboard" });
      return;
    }
    const stored = readActiveChildId();
    const next =
      (stored && childrenQ.data.some((c) => c.id === stored) && stored) ||
      childrenQ.data[0]!.id;
    setChildId(next);
    writeActiveChildId(next);
  }, [childrenQ.data, navigate]);

  useEffect(() => {
    if (search.family) setFamilyId(familyIdFromSearch(search.family));
  }, [search.family]);

  const child = childrenQ.data?.find((c) => c.id === childId);
  const grade = (child?.grade ?? 1) as Grade;
  const viewGrade = resolveActiveGrade({
    urlGrade: search.grade,
    profileGrade: grade,
    childId,
  });
  usePersistActiveGrade(viewGrade, childId);
  useEffect(() => {
    if (childId && search.grade == null) {
      void navigate({
        to: "/app/workshop",
        search: { grade: viewGrade, ...(search.family ? { family: search.family } : {}) },
        replace: true,
      });
    }
  }, [childId, search.grade, search.family, viewGrade, navigate]);

  if (childrenQ.isLoading || !child) {
    return (
      <AppShell>
        <div className="mx-auto max-w-lg px-4 py-10">
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell childName={child.name} grade={grade}>
      <main className="mx-auto max-w-lg px-4 py-8">
        <p className="text-xs tracking-[0.2em] text-fg-subtle">{t("workshopKicker")}</p>
        <h1 className="mt-1 font-display text-3xl">{t("workshopTitle")}</h1>
        <p className="mt-2 text-sm text-fg-muted">{t("workshopLead")}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {PHONETIC_FAMILIES.map((f) => (
            <button
              key={f.id}
              type="button"
              data-family-active={f.id === family.id ? "true" : undefined}
              onClick={() => {
                setFamilyId(f.id);
                setDone(false);
              }}
              className={cn(
                "rounded-md border px-3 py-1.5 font-display text-sm",
                f.id === family.id ? "border-fg bg-fg text-bg" : "border-border bg-surface text-fg",
              )}
            >
              {f.label_ja}
            </button>
          ))}
        </div>
        <p className="mt-3 text-sm text-fg-subtle">{family.why}</p>
        <div className="mt-6">
          <PhoneticWorkshopBoard
            family={family}
            childGrade={grade}
            onCommit={(_choiceId, _meta) => {
              setDone(true);
            }}
          />
        </div>
        {done ? <p className="mt-8 text-center text-sm text-fg-muted">{t("workshopDone")}</p> : null}
      </main>
    </AppShell>
  );
}
