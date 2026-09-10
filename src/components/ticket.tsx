import { CORPORATE_NAME, PLAN_PRICE_JPY, STATEMENT_DESCRIPTOR, trainNameOrDefault } from "@/lib/commerce-copy";
import { dateWithYearLabel } from "@/lib/trial-clock";
import { useI18n } from "@/lib/i18n/i18n";
import { cn } from "@/lib/utils";
import type { Plan } from "@/lib/subscription-derive";
import type { ReactNode } from "react";

/**
 * One ticket motif, two moments: the unpunched 乗車券 a parent is handed
 * before boarding (/handoff), and the punched, stamped 定期券 they hold
 * afterwards (/subscribe/success).
 *
 * Shares SessionStub's visual grammar -- semicircular punch notches bitten
 * out of both edges by an overlaying circle in the page colour -- with two
 * deliberate departures: no dashed perforation anywhere (product-wide,
 * dashes mean "not yet real", and a paid ticket is the realest thing on the
 * screen), and square corners rather than SessionStub's rounded ones.
 */
function Ticket({
  tone,
  children,
  ...rest
}: {
  tone: "outbound" | "arrival";
  children: ReactNode;
} & Record<`data-${string}`, string | undefined>) {
  return (
    <article
      data-ticket={tone}
      className={cn(
        "relative mx-auto w-full max-w-[420px] overflow-hidden border-2",
        tone === "outbound"
          ? "border-border-strong bg-surface"
          : "border-primary bg-ticket-amber",
      )}
      {...rest}
    >
      <span aria-hidden className="absolute top-1/2 -left-3 size-6 -translate-y-1/2 rounded-full bg-bg" />
      <span aria-hidden className="absolute top-1/2 -right-3 size-6 -translate-y-1/2 rounded-full bg-bg" />
      {children}
    </article>
  );
}

/** Per-plan display copy. `plan` is never null here -- /handoff only renders once a plan has resolved. */
function planTitleKey(plan: Plan) {
  return plan === "buyout" ? "planCardFamilyTitle" : "planCardAnnualTitle";
}

/**
 * The pre-boarding ticket on /handoff: what is being bought, for how much,
 * that it does not renew, who is charging, and what that charge will look
 * like on a statement. No child name -- a purchase is household-scoped, and
 * this screen is about to hand off to a third-party origin.
 */
export function OutboundTicket({ plan }: { plan: Plan }) {
  const { t } = useI18n();
  return (
    <Ticket tone="outbound" data-plan={plan}>
      <header className="border-b border-border px-5 py-3">
        <p className="font-display text-sm tracking-[0.3em] text-fg-muted">{t("ticketOutboundLabel")}</p>
      </header>
      <div className="px-5 py-5 text-ticket-ink">
        <p className="font-display text-xl">{t(planTitleKey(plan))}</p>
        <p className="mt-2 font-display text-3xl">
          {PLAN_PRICE_JPY[plan]}
          <span className="ml-1 font-sans text-xs text-fg-muted">{t("ticketTaxIncluded")}</span>
        </p>
        <p className="mt-2 text-sm text-fg-muted">
          {plan === "buyout" ? t("ticketNoteBuyout") : t("ticketNoteAnnual")}
        </p>
        <div className="mt-5 border-t border-border pt-3 text-xs text-fg-subtle">
          <span className="tracking-[0.2em]">{t("ticketIssuer")}</span>
          <span className="ml-3" data-ticket-issuer>
            {CORPORATE_NAME}
          </span>
        </div>
      </div>
    </Ticket>
  );
}

/**
 * The statement descriptor, shown next to the ticket rather than inside it.
 * Sits outside <OutboundTicket> so it reads as a note about the charge
 * rather than a line of the ticket itself.
 */
export function StatementNotice() {
  const { t } = useI18n();
  return (
    <p className="mt-4 text-center text-xs leading-5 text-fg-muted" data-statement-descriptor={STATEMENT_DESCRIPTOR}>
      {t("statementNotice", { descriptor: STATEMENT_DESCRIPTOR })}
    </p>
  );
}

/**
 * The arrival pass on /subscribe/success: punched, stamped, and warmer than
 * the outbound ticket. The vermilion 済 is the one saturated element on the
 * screen apart from the ride button.
 *
 * `plan` can be null on the unmatched-variant edge case (a real payment
 * whose variant id matched neither configured env var -- see
 * subscription-derive.ts); entitlement is granted regardless, so this
 * renders a generic valid pass rather than claiming a tier it can't prove.
 */
export function ArrivalPass({
  plan,
  paidUntil,
  trainName,
}: {
  plan: Plan | null;
  paidUntil: string | null;
  trainName?: string | null;
}) {
  const { t, locale } = useI18n();
  const validity =
    plan === "annual" && paidUntil
      ? dateWithYearLabel(paidUntil, locale)
      : t("passValidityForever");
  return (
    <Ticket tone="arrival" data-pass-plan={plan ?? "none"}>
      <header className="flex items-center justify-between border-b border-primary/30 px-5 py-3">
        <p className="font-display text-sm tracking-[0.3em] text-ticket-ink">{t("passLabel")}</p>
        <span aria-hidden className="flex gap-1.5">
          <span className="size-2 rounded-full bg-ticket-ink/60" />
          <span className="size-2 rounded-full bg-ticket-ink/60" />
        </span>
      </header>
      <div className="relative px-5 py-5 text-ticket-ink">
        <p className="font-display text-2xl" data-pass-passenger>
          {trainNameOrDefault(trainName)}
        </p>
        <p className="mt-4 text-sm text-fg-muted">{plan ? t(planTitleKey(plan)) : t("currentPlanGeneric")}</p>
        <p className="mt-1 text-sm">
          <span className="text-fg-muted">{t("passValidityLabel")}</span>
          <span className="ml-3 font-display text-base" data-pass-validity>
            {validity}
          </span>
        </p>
        <span
          aria-hidden
          data-pass-stamp
          className="absolute right-5 bottom-4 grid size-12 -rotate-12 place-items-center border-2 border-status-lost font-display text-xl text-status-lost"
        >
          {t("passStamp")}
        </span>
      </div>
    </Ticket>
  );
}
