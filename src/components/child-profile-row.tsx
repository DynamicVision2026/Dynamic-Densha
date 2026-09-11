import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StartBandPicker } from "@/components/start-band-picker";
import { GRADES } from "@/lib/grade-nav";
import type { StartBand } from "@/lib/grade-route";
import { useI18n } from "@/lib/i18n/i18n";
import { cn } from "@/lib/utils";

/**
 * One child, with the two edits a parent actually needs: the nickname and the
 * school year.
 *
 * They are presented together and committed SEPARATELY, because their blast
 * radii are nothing alike. A nickname is a column write. A school year is a
 * route migration -- it archives the child's current grade_routes row, writes
 * a new one and re-cuts this week's new characters -- so it gets its own
 * confirmation, and that confirmation leads with what does NOT change:
 * 「学年を変更しても、これまでのかんぺきな記録は消えません」. A parent
 * hesitating over this button is hesitating about losing their child's work,
 * and that is the sentence that answers them.
 *
 * The nickname is the child's own, not the parent's Google name -- nothing in
 * this app has ever copied one into the other, and the field being plainly
 * here is what makes that visible.
 */
export function ChildProfileRow({
  child,
  onRename,
  onSetGrade,
  onSetStartBand,
}: {
  child: { id: string; name: string; grade: number; startBand: StartBand };
  onRename: (name: string) => Promise<void>;
  onSetGrade: (grade: number) => Promise<{ ok: boolean; message?: string }>;
  onSetStartBand: (band: StartBand) => Promise<void>;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(child.name);
  const [grade, setGrade] = useState(child.grade);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(child.name);
    setGrade(child.grade);
    setConfirming(false);
    setError(null);
  }, [child.id, child.name, child.grade]);

  const nameChanged = name.trim() !== "" && name.trim() !== child.name;
  const gradeChanged = grade !== child.grade;

  async function saveName() {
    setBusy(true);
    setError(null);
    try {
      await onRename(name.trim());
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function applyGrade() {
    setBusy(true);
    setError(null);
    const result = await onSetGrade(grade);
    setBusy(false);
    if (result.ok) {
      setConfirming(false);
      setEditing(false);
    } else {
      setError(result.message ?? t("gradeChangeFailed"));
    }
  }

  return (
    <li data-child-row={child.id} className="py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-display text-base">{child.name}</span>
        <span className="text-sm text-fg-muted">{t("gradeN", { n: child.grade })}</span>
        <button
          type="button"
          data-child-edit={child.id}
          aria-expanded={editing}
          onClick={() => setEditing((v) => !v)}
          className="ml-auto inline-flex min-h-11 items-center rounded-lg px-3 text-sm text-fg-muted underline-offset-4 hover:bg-bg-warm hover:text-fg"
        >
          {t("renameChildLabel")}・{t("gradeChangeLabel")}
        </button>
      </div>

      {editing ? (
        <div className="mt-3 rounded-lg border border-border bg-bg-warm p-4">
          <div className="space-y-1.5">
            <Label htmlFor={`name-${child.id}`}>{t("renameChildLabel")}</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id={`name-${child.id}`}
                maxLength={20}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="min-w-0 flex-1 sm:max-w-[220px]"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                data-rename-save={child.id}
                disabled={busy || !nameChanged}
                onClick={() => void saveName()}
              >
                {t("renameSave")}
              </Button>
            </div>
          </div>

          <div className="mt-4 space-y-1.5">
            <Label>{t("gradeChangeLabel")}</Label>
            <div className="grid grid-cols-6 gap-1.5">
              {GRADES.map((g) => (
                <button
                  key={g}
                  type="button"
                  data-grade-pick={g}
                  onClick={() => {
                    setGrade(g);
                    setConfirming(false);
                    setError(null);
                  }}
                  className={cn(
                    "min-h-11 rounded-md border text-sm",
                    grade === g ? "border-fg bg-fg text-bg" : "border-border bg-bg",
                  )}
                >
                  {g}
                </button>
              ))}
            </div>

            {gradeChanged && !confirming ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-2"
                data-grade-request={child.id}
                onClick={() => setConfirming(true)}
              >
                {t("gradeChangeAction")}
              </Button>
            ) : null}

            {gradeChanged && confirming ? (
              <div className="mt-2 rounded-lg border border-border bg-surface p-3" data-grade-confirm>
                <p className="text-sm">{t("gradeChangeConfirm", { name: child.name, grade })}</p>
                {/* The reassurance leads. It is the question the parent is
                    actually asking by hovering over this button. */}
                <p className="mt-1.5 text-sm text-status-perfect" data-grade-safe-note>
                  {t("gradeChangeSafe")}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    data-grade-apply={child.id}
                    disabled={busy}
                    onClick={() => void applyGrade()}
                  >
                    {t("gradeChangeApply")}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                    {t("cancel")}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          {/* 乗りはじめ: which part of the year's characters this child
              started from. Per-child, rarely changed, and it lives with the
              other two edits rather than in a panel of its own -- three
              places to change one child's settings is two too many. */}
          <div className="mt-4 border-t border-border pt-4" data-start-band={child.id}>
            <StartBandPicker
              value={child.startBand}
              onChange={(band) => {
                setBusy(true);
                void onSetStartBand(band).finally(() => setBusy(false));
              }}
              disabled={busy}
            />
          </div>

          {error ? (
            <p className="mt-3 text-sm text-destructive" data-child-row-error>
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
