import { useI18n } from "@/lib/i18n/i18n";

export function PuzzleFrame({
  imagery,
  filled,
}: {
  imagery: string;
  filled?: string;
}) {
  const { t } = useI18n();
  return (
    <div className="mx-auto w-full max-w-sm">
      <div className="mx-auto mb-2 h-3 w-16 rounded-sm bg-engine/80" />
      <div className="rounded-lg border border-border bg-surface px-5 py-8 shadow-soft">
        <p className="text-center font-display text-sm leading-relaxed text-fg-muted">
          {imagery}
        </p>
        <div className="mx-auto mt-6 grid size-24 place-items-center rounded-md border border-dashed border-border-strong bg-bg">
          {filled ? (
            <span className="font-display text-5xl leading-none text-fg">{filled}</span>
          ) : (
            <span className="text-xs tracking-widest text-fg-subtle">{t("missing")}</span>
          )}
        </div>
      </div>
    </div>
  );
}
