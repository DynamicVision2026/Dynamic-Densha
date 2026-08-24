import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { getKanji } from "@/data/kyoiku";
import type { PhoneticFamily, PhoneticMember } from "@/data/phonetic-families";
import {
  FAMILY_HIT_ID,
  FAMILY_MISS_ID,
  FAMILY_SHIFT_ID,
  chipsForFamily,
  classifyFamilyChoice,
  type FamilyQuizMeta,
} from "@/lib/phonetic-family";
import { useI18n } from "@/lib/i18n/i18n";
import { cn } from "@/lib/utils";
import { SpeakerButton } from "@/components/speaker-button";

type Phase = "houses" | "reveal" | "done";

function outcomeKey(kind: "hit" | "shift" | "miss") {
  if (kind === "hit") return "workshopHit" as const;
  if (kind === "shift") return "workshopShift" as const;
  return "workshopMiss" as const;
}

function outcomeBody(kind: "hit" | "shift" | "miss") {
  if (kind === "hit") return "workshopHitBody" as const;
  if (kind === "shift") return "workshopShiftBody" as const;
  return "workshopMissBody" as const;
}

export function memberFromMeta(meta: FamilyQuizMeta): PhoneticMember {
  return {
    kanji: meta.composed,
    meaning_part: meta.house,
    house_ja: meta.house_ja,
    expected_reading: meta.expected_reading,
    outcome: meta.outcome,
    grade: getKanji(meta.composed)?.grade ?? 99,
  };
}

export function PhoneticWorkshopBoard({
  family,
  member,
  childGrade,
  locked,
  resultKind,
  onCommit,
}: {
  family: PhoneticFamily;
  member?: PhoneticMember | null;
  childGrade: number;
  locked?: boolean;
  resultKind?: "hit" | "shift" | "miss" | null;
  onCommit: (choiceId: string, meta: { kanji: string; reading: string }) => void;
}) {
  const { t } = useI18n();
  const scoped = member ?? null;
  const houses = scoped ? [scoped] : family.members;
  const [house, setHouse] = useState<PhoneticMember | null>(scoped);
  const [phase, setPhase] = useState<Phase>("houses");
  const [picked, setPicked] = useState<string | null>(null);
  const [kind, setKind] = useState<"hit" | "shift" | "miss" | null>(resultKind ?? null);

  useEffect(() => {
    setHouse(scoped);
    setPhase(scoped ? "reveal" : "houses");
    setPicked(null);
    setKind(resultKind ?? null);
  }, [family.id, scoped?.kanji, resultKind]);

  const placed = phase !== "houses";
  const target = house;
  const atGrade = target ? target.grade <= childGrade : family.phonetic.grade <= childGrade;

  return (
    <div className="space-y-6" data-tour="workshop-board">
      <div className="rounded-lg border border-border bg-surface px-4 py-5">
        <p className="text-center text-xs tracking-[0.22em] text-fg-subtle">{t("workshopStone")}</p>
        <p className="mt-3 text-center font-display text-7xl leading-none">{family.phonetic.kanji}</p>
        <p className="mt-3 flex items-center justify-center gap-2 font-display text-xl tracking-[0.18em] text-fg-muted">
          <span>{family.phonetic.reading}</span>
          <SpeakerButton text={family.phonetic.reading} />
        </p>
        <p className="mt-2 text-center text-sm text-fg-muted">{t("workshopBet")}</p>
      </div>

      <div>
        <p className="text-xs tracking-[0.2em] text-fg-subtle">{t("workshopHouse")}</p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {houses.map((h) => {
            const active = house?.kanji === h.kanji;
            return (
              <button
                key={h.kanji}
                type="button"
                data-tour={`house-${h.meaning_part}`}
                disabled={locked || placed}
                onClick={() => {
                  setHouse(h);
                  setPhase("reveal");
                  setPicked(null);
                  setKind(null);
                }}
                className={cn(
                  "flex min-h-24 flex-col items-center justify-center rounded-md border px-2 py-3 transition-[background-color,border-color] duration-150",
                  active && placed
                    ? "border-fg bg-fg text-bg"
                    : "border-border bg-surface hover:bg-bg-warm",
                  locked && "opacity-70",
                )}
              >
                <span className="font-display text-3xl leading-none">{h.meaning_part}</span>
                <span className="mt-2 text-[11px] text-current/70">{h.house_ja}</span>
              </button>
            );
          })}
        </div>
      </div>

      {target && placed ? (
        <div className="rounded-lg border border-border bg-bg px-4 py-5 text-center">
          <p className="text-xs tracking-[0.2em] text-fg-subtle">{t("workshopReveal")}</p>
          <p className="mt-3 font-display text-7xl leading-none" data-tour="workshop-composed">
            {target.kanji}
          </p>
          {!atGrade ? <p className="mt-3 text-sm text-fg-muted">{t("workshopUnopened")}</p> : null}
          {phase !== "done" && !kind ? (
            <div className="mt-5">
              <p className="text-sm font-medium">{t("workshopReadingPrompt")}</p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {chipsForFamily(family).map((label) => (
                  <div key={label} className="flex items-center gap-1">
                    <button
                      type="button"
                      data-tour={`read-${label}`}
                      disabled={locked}
                      onClick={() => setPicked(label)}
                      className={cn(
                        "h-12 min-w-20 rounded-md border px-4 font-display text-lg",
                        picked === label ? "border-fg bg-fg text-bg" : "border-border bg-surface",
                      )}
                    >
                      {label}
                    </button>
                    <SpeakerButton text={label} />
                  </div>
                ))}
              </div>
              <Button
                type="button"
                className="mt-4 h-12 min-w-40"
                data-tour="workshop-check"
                disabled={!picked || locked}
                onClick={() => {
                  if (!picked || !target) return;
                  const cls = classifyFamilyChoice(target, picked);
                  const id = cls === "hit" ? FAMILY_HIT_ID : cls === "shift" ? FAMILY_SHIFT_ID : FAMILY_MISS_ID;
                  setKind(cls);
                  setPhase("done");
                  onCommit(id, { kanji: target.kanji, reading: picked });
                }}
              >
                {t("checkAnswer")}
              </Button>
            </div>
          ) : null}
          {kind ? (
            <div className="mt-5 space-y-2">
              <p className="font-display text-xl" data-tour="workshop-outcome">
                {t(outcomeKey(kind))}
              </p>
              <p className="text-sm text-fg-muted">{t(outcomeBody(kind))}</p>
              <p className="text-sm text-fg-subtle">
                {target.kanji} · {target.expected_reading}
              </p>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="text-center text-sm text-fg-muted">{t("workshopPlace")}</p>
      )}
    </div>
  );
}
