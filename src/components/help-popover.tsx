import { useEffect, useId, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/i18n";

/**
 * The (?) explainer. Parent surface only -- everything it is ever used to
 * explain is about money or entitlement.
 *
 * A disclosure, not a hover tooltip: this has to work on the phone a parent
 * actually holds, where there is no hover, and a title attribute never
 * appears at all. 44x44 tap target on a 16px glyph, closes on Escape and on
 * an outside tap, and the panel is in the DOM only while open so a screen
 * reader does not read the explanation twice.
 */
export function HelpPopover({
  label,
  title,
  body,
}: {
  /** Describes the BUTTON for a screen reader, since "?" alone says nothing. */
  label: string;
  title: string;
  body: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <span ref={wrap} className="relative inline-flex">
      <button
        type="button"
        data-help-toggle
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-11 w-11 items-center justify-center rounded-full text-fg-muted hover:bg-bg-warm hover:text-fg"
      >
        <span
          aria-hidden
          className="grid h-5 w-5 place-items-center rounded-full border border-current text-[11px] leading-none"
        >
          ?
        </span>
      </button>
      {open ? (
        <span
          id={panelId}
          role="note"
          data-help-panel
          className="absolute right-0 top-12 z-20 w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-4 text-left shadow-soft"
        >
          <span className="block font-display text-sm">{title}</span>
          <span className="mt-1.5 block text-xs leading-6 text-fg-muted">{body}</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-3 inline-flex min-h-11 items-center text-xs text-fg-muted underline-offset-4 hover:underline"
          >
            {t("closeLabel")}
          </button>
        </span>
      ) : null}
    </span>
  );
}
