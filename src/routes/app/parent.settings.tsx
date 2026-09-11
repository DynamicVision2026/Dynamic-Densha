import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ParentHub } from "@/components/parent-shell";
import { ChildProfileRow } from "@/components/child-profile-row";
import { HelpPopover } from "@/components/help-popover";
import { RefundModal } from "@/components/refund-modal";
import { PassAssignmentCard } from "@/components/pass-assignment-card";
import { InstallGuide } from "@/components/install-guide";
import { PlanCards, CurrentPlanNotice } from "@/components/plan-cards";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { childLabels, formatChildLabel } from "@/lib/child-labels";
import { readActiveChildId } from "@/lib/active-child";
import { resolveInitialChildId } from "@/lib/child-route-resolve";
import { archiveChild, listChildren, renameChild, setChildGrade, updateStartBand } from "@/lib/server/children";
import { assignAnnualPass, getPassAssignment } from "@/lib/server/pass";
import { getAccountSummary } from "@/lib/server/account";
import { useI18n } from "@/lib/i18n/i18n";

export const Route = createFileRoute("/app/parent/settings")({
  component: ParentSettings,
});

/**
 * 設定・お手続き -- everything administrative, and deliberately no $childId.
 *
 * Every fact on this hub is a HOUSEHOLD fact: the plan, the pass, the order,
 * the signed-in account. Even profile management lists all the children
 * rather than acting on a selected one. That asymmetry against the report hub
 * (which is about one child) is the whole point of splitting them: a parent
 * checking whether their daughter rode this week and a parent moving a pass
 * between siblings are on different errands, minutes and moods apart.
 */
function ParentSettings() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [refundOpen, setRefundOpen] = useState(false);

  const childrenQ = useQuery({ queryKey: ["children"], queryFn: () => listChildren() });
  const passQ = useQuery({ queryKey: ["pass-assignment"], queryFn: () => getPassAssignment() });
  const accountQ = useQuery({ queryKey: ["account-summary"], queryFn: () => getAccountSummary() });

  const archiveMut = useMutation({
    mutationFn: (childId: string) => archiveChild({ data: { childId } }),
    onSuccess: async () => {
      await Promise.all([
        childrenQ.refetch(),
        passQ.refetch(),
        accountQ.refetch(),
        qc.invalidateQueries({ queryKey: ["overview"] }),
      ]);
    },
  });

  const children = childrenQ.data ?? [];
  const account = accountQ.data;
  // The report tab needs somewhere to point; the last-viewed child is the
  // least surprising answer.
  const reportChildId = resolveInitialChildId(children, readActiveChildId());
  const labels = childLabels(
    children,
    (g) => t("gradeN", { n: g }),
    (n) => t("childOrdinal", { n }),
  );

  return (
    <ParentHub tab="settings" childId={reportChildId}>
      {/* ── お子さまの管理 ─────────────────────────────────────── */}
      <section className="mt-5 rounded-xl border border-border bg-surface p-5 sm:p-6" data-settings-children>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-lg">{t("settingsChildren")}</h2>
          {account ? (
            <span className="text-sm tabular-nums text-fg-muted" data-child-count>
              {account.childLimit > 0
                ? t("childCountOfLimit", { n: account.childCount, limit: account.childLimit })
                : t("childCountUncapped", { n: account.childCount })}
            </span>
          ) : null}
        </div>

        {childrenQ.isLoading ? (
          <Skeleton className="mt-4 h-24 w-full rounded-lg" />
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {children.map((c, i) => (
              <ChildProfileRow
                key={c.id}
                child={{ id: c.id, name: c.name, grade: c.grade, startBand: c.startBand }}
                ambiguous={labels[i]?.qualifier != null}
                displayLabel={labels[i] ? formatChildLabel(labels[i]!) : c.name}
                onRename={async (name) => {
                  await renameChild({ data: { childId: c.id, name } });
                  await Promise.all([
                    childrenQ.refetch(),
                    qc.invalidateQueries({ queryKey: ["overview"] }),
                  ]);
                }}
                onSetGrade={async (grade) => {
                  const result = await setChildGrade({ data: { childId: c.id, grade } });
                  if ("error" in result) {
                    return { ok: false, message: t("gradeChangeFailed") };
                  }
                  await Promise.all([
                    childrenQ.refetch(),
                    // The board and the report both key off the child's grade.
                    qc.invalidateQueries({ queryKey: ["overview"] }),
                    qc.invalidateQueries({ queryKey: ["home"] }),
                    qc.invalidateQueries({ queryKey: ["map"] }),
                  ]);
                  return { ok: true };
                }}
                onSetStartBand={async (startBand) => {
                  await updateStartBand({ data: { childId: c.id, startBand } });
                  await Promise.all([
                    childrenQ.refetch(),
                    qc.invalidateQueries({ queryKey: ["overview"] }),
                  ]);
                }}
              />
            ))}
          </ul>
        )}

        <div className="mt-4 border-t border-border pt-4">
          <Link
            to="/onboard"
            search={{ add: true }}
            data-add-child
            className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-dashed border-border px-4 text-sm sm:w-auto"
          >
            ＋ {t("addChild")}
          </Link>
          {/* The tier rule, stated BEFORE the tap. A parent who fills in a
              name and a grade and is then refused has been wasted; a parent
              on an annual pass who adds a sibling and finds them locked out
              with no warning reads it as a bug. */}
          {account ? (
            <p className="mt-2 text-xs leading-5 text-fg-subtle" data-add-child-rule>
              {account.plan === "annual" ? t("addChildAnnualRule") : null}
              {account.childLimit > 0 ? t("addChildTrialRule") : null}
            </p>
          ) : null}
        </div>

        {archiveMut.isError ? (
          <p className="mt-3 text-sm text-destructive" data-archive-error>
            {archiveMut.error instanceof Error ? archiveMut.error.message : t("saveFailed")}
          </p>
        ) : null}
        {children.length > 1 ? (
          <ArchiveControl
            children={children}
            pending={archiveMut.isPending}
            onArchive={(id) => archiveMut.mutate(id)}
          />
        ) : null}
      </section>

      {/* ── ご利用プラン・乗車設定 ──────────────────────────────── */}
      <section className="mt-4 rounded-xl border border-border bg-surface p-5 sm:p-6" data-settings-plan>
        <div className="flex flex-wrap items-center justify-between gap-1">
          <h2 className="font-display text-lg">{t("settingsPlan")}</h2>
          <HelpPopover
            label={t("passHelpOpen")}
            title={t("passHelpTitle")}
            body={t("passHelpBody")}
          />
        </div>

        {account ? (
          account.plan ? (
            <CurrentPlanNotice plan={account.plan} paidUntil={account.paidUntil} />
          ) : (
            <PlanCards />
          )
        ) : (
          <Skeleton className="mt-3 h-20 w-full rounded-lg" />
        )}
      </section>

      {passQ.data ? (
        <PassAssignmentCard
          assignment={passQ.data}
          children={children.map((c) => ({ id: c.id, name: c.name, grade: c.grade, createdAt: c.createdAt }))}
          onAssign={async (id) => {
            const result = await assignAnnualPass({ data: { childId: id } });
            // Coverage changes what EVERY child's surface may do -- the one
            // gaining the pass and the one losing it -- so every cache keyed
            // by child goes, not just the board's. `study` matters most: a
            // child sitting on /app/child/<id>/kanji/<char> when the pass
            // moves away holds a payload the server would now refuse.
            //
            // Verified in both directions, in-app with no reload, by
            // scripts/pass-cache-walkthrough.mjs.
            await Promise.all([
              passQ.refetch(),
              qc.invalidateQueries({ queryKey: ["overview"] }),
              qc.invalidateQueries({ queryKey: ["home"] }),
              qc.invalidateQueries({ queryKey: ["map"] }),
              qc.invalidateQueries({ queryKey: ["study"] }),
              qc.invalidateQueries({ queryKey: ["pass-state"] }),
            ]);
            return result;
          }}
        />
      ) : null}

      {/* ── アカウント・サポート ────────────────────────────────── */}
      <section className="mt-4 rounded-xl border border-border bg-surface p-5 sm:p-6" data-settings-account>
        <h2 className="font-display text-lg">{t("accountTitle")}</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex flex-wrap justify-between gap-x-4 gap-y-0.5">
            <dt className="text-fg-muted">{t("accountEmail")}</dt>
            <dd className="break-all" data-account-email>
              {account?.email ?? "—"}
            </dd>
          </div>
          <div className="flex flex-wrap justify-between gap-x-4 gap-y-0.5">
            <dt className="text-fg-muted">{t("accountOrder")}</dt>
            <dd className="tabular-nums" data-account-order>
              {account?.orderName ?? t("accountNoOrder")}
            </dd>
          </div>
        </dl>

        <button
          type="button"
          data-refund-open
          onClick={() => setRefundOpen(true)}
          className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-border bg-bg px-4 text-sm"
        >
          {t("refundOpen")}
        </button>
      </section>

      {/* Below everything, and self-hiding once the app is already on the
          home screen -- /subscribe/success is seen exactly once, so this is
          the second and last place a parent can pick the guide up. */}
      <InstallGuide />

      <RefundModal
        open={refundOpen}
        onClose={() => setRefundOpen(false)}
        orderName={account?.orderName ?? null}
        email={account?.email ?? null}
      />
    </ParentHub>
  );
}

/**
 * Archiving is here rather than on a child's own row: it is rare, it is the
 * only destructive-feeling control on the page, and putting it inside the
 * same panel a parent opens to fix a typo invites the wrong tap.
 */
function ArchiveControl({
  children,
  pending,
  onArchive,
}: {
  children: { id: string; name: string }[];
  pending: boolean;
  onArchive: (id: string) => void;
}) {
  const { t } = useI18n();
  const [target, setTarget] = useState<string | null>(null);
  const child = children.find((c) => c.id === target);

  return (
    <div className="mt-4 border-t border-border pt-4">
      {child ? (
        <div className="rounded-lg border border-border bg-bg-warm p-3" data-archive-confirm>
          <p className="text-sm text-fg-muted">{t("archiveConfirmBody", { name: child.name })}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="text-destructive"
              disabled={pending}
              onClick={() => {
                onArchive(child.id);
                setTarget(null);
              }}
            >
              {t("archiveConfirmButton")}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setTarget(null)}>
              {t("cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {children.map((c) => (
            <button
              key={c.id}
              type="button"
              data-archive-pick={c.id}
              onClick={() => setTarget(c.id)}
              className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm text-fg-muted underline-offset-4 hover:underline"
            >
              {t("archiveChildButton")}：{c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
