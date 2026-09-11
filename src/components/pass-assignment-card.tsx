import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { childLabels, formatChildLabel } from "@/lib/child-labels";
import type { AssignResult, PassAssignment } from "@/lib/server/pass";
import { dateWithYearLabel } from "@/lib/trial-clock";
import { useI18n } from "@/lib/i18n/i18n";

/**
 * Choosing which child the annual pass covers. PARENT SURFACE ONLY.
 *
 * This component is the counterweight to everything the child surface is not
 * allowed to say. A child whose sibling holds the pass sees a board and a
 * boarding pass that reads 「いまは のれません」 and nothing else -- no
 * price, no plan, no explanation, because the explanation is about money and
 * a decision they cannot make. It belongs here, in front of the person who
 * can: what the pass covers, who has it, what it would cost to cover
 * everyone, and how to change their mind.
 *
 * Two shapes, one component:
 *   - UNASSIGNED: blocking. Nobody in the household rides until a child is
 *     chosen, and that is correct rather than a bug to soften -- an
 *     unassigned pass covers no one, and a default pick would be the app
 *     spending a family's money on an assumption.
 *   - ASSIGNED: who holds it, and a confirmed reassignment, with the
 *     cooldown date shown plainly when one is running.
 *
 * Presentational: the server call arrives as `onAssign` rather than being
 * imported here. Only ROUTE files get TanStack Start's server-function split
 * transform -- a plain component that imports from @/lib/server/* drags that
 * module's whole import chain into the client bundle, and this one reached
 * node:crypto through server/household.ts. The page died on load with
 * "Module node:crypto has been externalized for browser compatibility";
 * typecheck and the full test suite were both green at the time.
 */
export function PassAssignmentCard({
  assignment,
  children,
  onAssign,
}: {
  assignment: PassAssignment;
  children: { id: string; name: string; grade: number; createdAt?: string }[];
  onAssign: (childId: string) => Promise<AssignResult>;
}) {
  const { t, locale } = useI18n();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Only an annual pass has anything to assign. A buyout covers everyone and
  // a trial covers everyone; rendering a chooser for either would invent a
  // restriction the family does not have.
  if (assignment.plan !== "annual") return null;

  // The pass chooser is where indistinguishable siblings did real damage: a
  // parent assigned the pass to one of two children both named "Brian2023",
  // then opened the other one's board and read the lock-out as a bug.
  const labels = childLabels(
    children,
    (g) => t("gradeN", { n: g }),
    (n) => t("childOrdinal", { n }),
  );
  const labelOf = (id: string) => {
    const found = labels.find((l) => l.id === id);
    return found ? formatChildLabel(found) : "";
  };
  const holder = children.find((c) => c.id === assignment.coveredChildId);
  const cooldownLabel = assignment.cooldownUntil
    ? t("passCooldownUntil", { date: dateWithYearLabel(assignment.cooldownUntil, locale) })
    : null;

  async function choose(childId: string, name: string) {
    // Reassignment is confirmed; the first assignment is not. Moving a pass
    // takes it away from a child who is using it today, and the cooldown
    // means it cannot simply be moved back.
    if (holder && !window.confirm(t("passReassignConfirm", { name }))) return;
    setError(null);
    setPending(childId);
    try {
      const result = await onAssign(childId);
      // The cooldown is the only failure a parent can act on, so it is the
      // only one that names a date. The other two mean the page is stale
      // (the plan changed, the child was archived elsewhere); the refetch the
      // caller does re-renders the card into whatever is now true.
      if ("error" in result) {
        setError(
          result.error.code === "COOLDOWN_ACTIVE"
            ? t("passCooldownUntil", { date: dateWithYearLabel(result.error.nextAllowedAt, locale) })
            : t("passAssignFailed"),
        );
      }
    } catch {
      setError(t("passAssignFailed"));
    } finally {
      setPending(null);
    }
  }

  return (
    <section
      data-pass-assignment
      data-pass-unassigned={holder ? undefined : "true"}
      className="mt-4 rounded-xl border border-border bg-surface p-5"
    >
      <h2 className="font-display text-lg">{holder ? t("passHolderTitle") : t("passAssignTitle")}</h2>
      {holder ? (
        <p className="mt-1 text-sm text-fg-muted">
          <span className="font-display text-base text-fg">{labelOf(holder.id)}</span>
        </p>
      ) : (
        <p className="mt-2 text-sm leading-6 text-fg-muted">{t("passAssignBody")}</p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {children.map((child) => {
          const current = child.id === assignment.coveredChildId;
          return (
            <button
              key={child.id}
              type="button"
              data-pass-choose={child.id}
              disabled={current || pending !== null || Boolean(cooldownLabel && holder)}
              onClick={() => void choose(child.id, labelOf(child.id))}
              className={`h-11 rounded-full border px-4 text-sm disabled:opacity-60 ${
                current ? "border-fg bg-fg text-bg" : "border-border bg-bg"
              }`}
            >
              {pending === child.id ? "…" : labelOf(child.id)}
            </button>
          );
        })}
      </div>

      {holder && cooldownLabel ? (
        <p className="mt-3 text-xs text-fg-subtle" data-pass-cooldown>
          {cooldownLabel}
        </p>
      ) : null}
      {holder && !cooldownLabel ? (
        <p className="mt-3 text-xs text-fg-subtle">{t("passReassign")}</p>
      ) : null}
      {error ? (
        <p className="mt-3 text-sm text-destructive" data-pass-assign-error>
          {error}
        </p>
      ) : null}

      <p className="mt-5 border-t border-border pt-4 text-sm leading-6 text-fg-muted">
        {t("passAssignFamilyHint")}
      </p>
      <Link
        to="/subscribe"
        search={{ plan: "buyout" }}
        data-pass-upgrade
        className="mt-3 inline-flex h-11 items-center justify-center rounded-lg border border-border bg-bg px-4 text-sm"
      >
        {t("passAssignFamilyCta")}
      </Link>
    </section>
  );
}
