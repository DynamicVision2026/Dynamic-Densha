import { useEffect, useRef, useState } from "react";
import { Languages } from "lucide-react";
import { LOCALES, LOCALE_META } from "@/lib/i18n/messages";
import { useI18n } from "@/lib/i18n/i18n";
import { cn } from "@/lib/utils";

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("language")}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-11 min-w-11 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-sm font-medium text-fg"
      >
        <Languages className="size-4 shrink-0" strokeWidth={1.75} />
        <span className="min-w-5">{LOCALE_META[locale].short}</span>
      </button>
      {open ? (
        <ul
          role="listbox"
          className="absolute right-0 z-40 mt-2 min-w-40 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-soft"
        >
          {LOCALES.map((id) => (
            <li key={id}>
              <button
                type="button"
                role="option"
                aria-selected={id === locale}
                className={cn(
                  "flex h-11 w-full items-center justify-between gap-3 px-3 text-left text-sm",
                  id === locale ? "bg-fg text-bg" : "text-fg hover:bg-bg-warm",
                )}
                onClick={() => {
                  setLocale(id);
                  setOpen(false);
                }}
              >
                <span>{LOCALE_META[id].native}</span>
                <span className="text-xs opacity-70">{LOCALE_META[id].short}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
