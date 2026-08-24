import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { PhoneticWorkshopBoard } from "@/components/phonetic-workshop";
import { Button } from "@/components/ui/button";
import { PHONETIC_FAMILIES } from "@/data/phonetic-families";
import { DEMO_CHILD, applyDemoWorkshop } from "@/lib/demo-progress";
import { resolveActiveGrade, usePersistActiveGrade } from "@/lib/active-grade";
import { workshopSearchFrom } from "@/lib/grade-nav";
import { FAMILY_HIT_ID } from "@/lib/phonetic-family";
import { useI18n } from "@/lib/i18n/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/demo/workshop")({
  component: DemoWorkshop,
  ssr: false,
  validateSearch: workshopSearchFrom,
});

function familyIdFromSearch(raw: string | undefined): string {
  if (raw && PHONETIC_FAMILIES.some((f) => f.id === raw)) return raw;
  return PHONETIC_FAMILIES[0]!.id;
}

function DemoWorkshop() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const viewGrade = resolveActiveGrade({
    urlGrade: search.grade,
    profileGrade: DEMO_CHILD.grade,
  });
  usePersistActiveGrade(viewGrade);
  useEffect(() => {
    if (search.grade == null) {
      void navigate({
        to: "/demo/workshop",
        search: { grade: viewGrade, ...(search.family ? { family: search.family } : {}) },
        replace: true,
      });
    }
  }, [search.grade, search.family, viewGrade, navigate]);
  const [familyId, setFamilyId] = useState(() => familyIdFromSearch(search.family));
  useEffect(() => {
    if (search.family) setFamilyId(familyIdFromSearch(search.family));
  }, [search.family]);
  const family = PHONETIC_FAMILIES.find((f) => f.id === familyId) ?? PHONETIC_FAMILIES[0]!;
  const [done, setDone] = useState(false);

  return (
    <AppShell childName={t("demoName")} grade={DEMO_CHILD.grade}>
      <main className="mx-auto max-w-lg px-4 py-8">
        <p className="text-xs tracking-[0.2em] text-fg-subtle">{t("workshopKicker")}</p>
        <h1 className="mt-1 font-display text-3xl" data-tour="workshop-title">
          {t("workshopTitle")}
        </h1>
        <p className="mt-2 text-sm text-fg-muted">{t("workshopLead")}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {PHONETIC_FAMILIES.map((f) => (
            <button
              key={f.id}
              type="button"
              data-tour={`family-${f.id}`}
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
            childGrade={DEMO_CHILD.grade}
            onCommit={(choiceId, meta) => {
              applyDemoWorkshop(meta.kanji, choiceId);
              if (choiceId === FAMILY_HIT_ID && meta.reading === family.phonetic.reading) {
                applyDemoWorkshop(family.phonetic.kanji, FAMILY_HIT_ID);
              }
              setDone(true);
            }}
          />
        </div>
        {done ? (
          <div className="mt-8 space-y-3 text-center">
            <p className="text-sm text-fg-muted">{t("workshopDone")}</p>
            <Button type="button" variant="outline" asChild>
              <Link to="/demo/map" search={{ grade: viewGrade }}>
                {t("navMap")}
              </Link>
            </Button>
          </div>
        ) : null}
      </main>
    </AppShell>
  );
}
