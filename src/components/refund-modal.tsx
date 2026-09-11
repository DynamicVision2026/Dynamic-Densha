import { useEffect, useRef } from "react";
import { refundMailtoHref } from "@/lib/refund-contact";
import { useI18n } from "@/lib/i18n/i18n";

/**
 * 返金・ご解約について. PARENT SURFACE ONLY, and a real dialog rather than a
 * link straight to a mail client: a parent who has decided to ask for their
 * money back deserves to read the policy before their mail app opens, not
 * after.
 *
 * The mail is pre-filled with the order number and the account email (see
 * refund-contact.ts) so support can look the purchase up from the first
 * message instead of a round trip.
 */
export function RefundModal({
  open,
  onClose,
  orderName,
  email,
}: {
  open: boolean;
  onClose: () => void;
  orderName: string | null;
  email: string | null;
}) {
  const { t } = useI18n();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // The page behind must not scroll under the sheet on a phone.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      data-refund-modal
      role="dialog"
      aria-modal="true"
      aria-labelledby="refund-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-5"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Bottom sheet on a phone, centred card once there is room. */}
      <div className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-border bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-soft sm:rounded-2xl sm:pb-5">
        <h2 id="refund-title" className="font-display text-lg">
          {t("refundTitle")}
        </h2>
        <p className="mt-3 text-sm leading-7 text-fg-muted">{t("refundBody")}</p>

        <a
          href={refundMailtoHref({ orderName, email })}
          data-refund-mailto
          className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-5 text-sm text-primary-fg"
        >
          {t("refundCta")}
        </a>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="mt-2 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-border bg-bg px-5 text-sm"
        >
          {t("closeLabel")}
        </button>
      </div>
    </div>
  );
}
