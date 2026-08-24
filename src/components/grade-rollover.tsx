import { useState } from "react";
import type { Grade } from "@/data/kyoiku";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/i18n";

export function GradeRolloverCard({
  grade,
  canRollover,
  aprilPrompt,
  onConfirm,
  onDismiss,
  pending,
}: {
  grade: Grade;
  canRollover: boolean;
  aprilPrompt?: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
  pending?: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <section className="mt-6 rounded-xl border border-border bg-surface p-5" data-grade-rollover>
      <h2 className="font-display text-lg">{t("rolloverTitle")}</h2>
      <p className="mt-1 text-sm text-fg-muted">
        {t("gradeLabel", { n: grade })}
        {aprilPrompt ? ` · ${t("rolloverApril")}` : ""}
      </p>
      {canRollover ? (
        <Button
          type="button"
          className="mt-4"
          data-tour="rollover-open"
          disabled={pending}
          onClick={() => setOpen(true)}
        >
          {t("rolloverTitle")}
        </Button>
      ) : (
        <p className="mt-4 text-sm text-fg-muted" data-rollover-cap>
          {t("rolloverCap")}
        </p>
      )}

      {open && canRollover ? (
        <div
          className="fixed inset-0 z-40 grid place-items-center bg-fg/40 p-5"
          role="dialog"
          aria-modal="true"
          data-rollover-dialog
        >
          <div className="w-full max-w-sm rounded-lg border border-border bg-surface px-5 py-6 shadow-soft">
            <p className="text-xs tracking-[0.2em] text-fg-subtle">{t("rolloverTitle")}</p>
            <h3 className="mt-3 font-display text-2xl">{t("rolloverAsk")}</h3>
            <p className="mt-2 text-sm leading-6 text-fg-muted">{t("rolloverLead")}</p>
            <div className="mt-6 flex flex-col gap-2">
              <Button
                type="button"
                data-tour="rollover-go"
                disabled={pending}
                onClick={() => {
                  onConfirm();
                  setOpen(false);
                }}
              >
                {t("rolloverGo")}
              </Button>
              <Button
                type="button"
                variant="outline"
                data-tour="rollover-stay"
                disabled={pending}
                onClick={() => {
                  onDismiss();
                  setOpen(false);
                }}
              >
                {t("rolloverStay")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
