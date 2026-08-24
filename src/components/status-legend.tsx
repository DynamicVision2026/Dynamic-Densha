import { STATUSES } from "@/lib/mastery";
import { STATUS_KEYS } from "@/lib/i18n/messages";
import { useI18n } from "@/lib/i18n/i18n";
import { STATUS_META } from "@/lib/mastery";
import { cn } from "@/lib/utils";

export function StatusLegend({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  return (
    <ul
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2",
        compact ? "justify-start" : "justify-center",
      )}
    >
      {STATUSES.map((s) => (
        <li key={s} className="flex items-center gap-1.5 text-xs text-fg-muted">
          <span className={cn("size-2.5 rounded-sm", STATUS_META[s].className)} />
          {t(STATUS_KEYS[s])}
        </li>
      ))}
    </ul>
  );
}
