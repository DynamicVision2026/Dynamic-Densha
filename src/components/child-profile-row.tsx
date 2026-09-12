import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StartBandPicker } from "@/components/start-band-picker";
import { GRADES } from "@/lib/grade-nav";
import type { StartBand } from "@/lib/grade-route";
import { useI18n } from "@/lib/i18n/i18n";
import { cn } from "@/lib/utils";

/** What one 保存 asks the server to change. An absent field was not edited. */
export type ChildSaveRequest = {
  name?: string;
  grade?: number;
  startBand?: StartBand;
};

export type ChildSaveResult = { ok: true } | { ok: false; message?: string };

/**
 * One child, and the three edits a parent actually needs: the nickname, the
 * school year and where in the year they board.
 *
 * They are edited together and saved together, by one 保存. That is not
 * cosmetic. The earlier panel committed each field on its own button, and a
 * parent who changed the name AND the year saw only the name persist: saving
 * the name closed the panel, and closing it re-read the year from the server,
 * silently discarding the selection they had just made. Any form with staged
 * state and a per-field commit has that bug available to it, so the staging
 * is now the whole panel's and there is exactly one control that writes.
 *
 * A school year is still not a column write -- it archives the child's
 * grade_routes row, writes a new one and re-cuts this week's new characters --
 * so it still gets a confirmation, and that confirmation still leads with what
 * does NOT change: 「学年を変更しても、これまでのかんぺきな記録は消えません」.
 * A parent hesitating over this button is hesitating about losing their
 * child's work, and that is the sentence that answers them. What changed is
 * only that confirming it saves the rest of the form too, instead of being a
 * separate errand.
 *
 * The nickname is the child's own, not the parent's Google name -- nothing in
 * this app has ever copied one into the other, and the field being plainly
 * here is what makes that visible.
 */
export function ChildProfileRow({
  child,
  onSave,
  ambiguous = false,
  displayLabel,
}: {
  child: { id: string; name: string; grade: number; startBand: StartBand };
  /**
   * Set when another living sibling shares this name. The rename field then
   * opens on its own and says why -- a parent who cannot tell two children
   * apart should not have to discover that a disclosure triangle is where
   * the fix lives.
   */
  ambiguous?: boolean;
  /** The disambiguated label, used wherever this child is named. */
  displayLabel?: string;
  onSave: (change: ChildSaveRequest) => Promise<ChildSaveResult>;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(ambiguous);
  const [name, setName] = useState(child.name);
  const [grade, setGrade] = useState(child.grade);
  const [startBand, setStartBand] = useState<StartBand>(child.startBand);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped after a successful save to force one re-sync from the refetched
  // child: a grade change re-cuts the route from the beginning of the new
  // year, so the server can legitimately return a 乗りはじめ the parent did
  // not pick, and the panel must show what is true rather than what was typed.
  const [syncKey, setSyncKey] = useState(0);
  // Props change mid-save (each mutation refetches), and that must not yank
  // the fields out from under the save that is still reading them.
  const saving = useRef(false);

  useEffect(() => {
    if (saving.current) return;
    setName(child.name);
    setGrade(child.grade);
    setStartBand(child.startBand);
    setConfirming(false);
  }, [child.id, child.name, child.grade, child.startBand, syncKey]);

  useEffect(() => {
    if (ambiguous) setEditing(true);
  }, [ambiguous]);

  const trimmed = name.trim();
  const nameChanged = trimmed !== child.name;
  const gradeChanged = grade !== child.grade;
  const bandChanged = startBand !== child.startBand;
  const dirty = nameChanged || gradeChanged || bandChanged;

  function discard() {
    setName(child.name);
    setGrade(child.grade);
    setStartBand(child.startBand);
    setConfirming(false);
    setError(null);
  }

  async function save() {
    if (!dirty) return;
    if (trimmed === "") {
      setError(t("childNameRequired"));
      return;
    }
    saving.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await onSave({
        ...(nameChanged ? { name: trimmed } : {}),
        ...(gradeChanged ? { grade } : {}),
        ...(bandChanged ? { startBand } : {}),
      });
      if (result.ok) {
        setConfirming(false);
        setEditing(false);
        setSyncKey((k) => k + 1);
        return;
      }
      setConfirming(false);
      setError(result.message ?? t("saveFailed"));
    } catch (err) {
      setConfirming(false);
      setError(err instanceof Error ? err.message : t("saveFailed"));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return (
    <li data-child-row={child.id} className="py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-display text-base">{displayLabel ?? child.name}</span>
        <span className="text-sm text-fg-muted">{t("gradeN", { n: child.grade })}</span>
        <button
          type="button"
          data-child-edit={child.id}
          aria-expanded={editing}
          onClick={() => {
            if (editing) {
              // Closing the panel abandons what was typed, so it must also
              // abandon what was staged -- leaving edits behind to reappear
              // later is how a parent ends up saving a change they thought
              // they had cancelled.
              discard();
              setEditing(false);
            } else {
              setEditing(true);
            }
          }}
          className="ml-auto inline-flex min-h-11 items-center rounded-lg px-3 text-sm text-fg-muted underline-offset-4 hover:bg-bg-warm hover:text-fg"
        >
          {t("renameChildLabel")}・{t("gradeChangeLabel")}
        </button>
      </div>

      {editing ? (
        <div className="mt-3 rounded-lg border border-border bg-bg-warm p-4">
          {ambiguous ? (
            <p className="mb-3 text-sm leading-6 text-fg-muted" data-duplicate-name-hint>
              {t("duplicateNameHint")}
            </p>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor={`name-${child.id}`}>{t("renameChildLabel")}</Label>
            <Input
              id={`name-${child.id}`}
              maxLength={20}
              value={name}
              disabled={busy}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              className="min-w-0 sm:max-w-[220px]"
            />
          </div>

          <div className="mt-4 space-y-1.5">
            <Label>{t("gradeChangeLabel")}</Label>
            <div className="grid grid-cols-6 gap-1.5">
              {GRADES.map((g) => (
                <button
                  key={g}
                  type="button"
                  data-grade-pick={g}
                  disabled={busy}
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
          </div>

          {/* 乗りはじめ: which part of the year's characters this child
              started from. Per-child, rarely changed, and it lives with the
              other two edits rather than in a panel of its own -- three
              places to change one child's settings is two too many. */}
          <div className="mt-4 border-t border-border pt-4" data-child-band={child.id}>
            <StartBandPicker value={startBand} onChange={setStartBand} disabled={busy} />
          </div>

          {gradeChanged && confirming ? (
            <div className="mt-4 rounded-lg border border-border bg-surface p-3" data-grade-confirm>
              <p className="text-sm">{t("gradeChangeConfirm", { name: trimmed || child.name, grade })}</p>
              {/* The reassurance leads. It is the question the parent is
                  actually asking by hesitating over this button. */}
              <p className="mt-1.5 text-sm text-status-perfect" data-grade-safe-note>
                {t("gradeChangeSafe")}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  data-grade-apply={child.id}
                  disabled={busy}
                  onClick={() => void save()}
                >
                  {t("gradeChangeApply")}
                </Button>
                <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>
                  {t("cancel")}
                </Button>
              </div>
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              data-child-save={child.id}
              // While the confirm is open it is the only thing that writes,
              // so there is never a second way to commit the same form.
              disabled={busy || !dirty || (gradeChanged && confirming)}
              onClick={() => {
                if (gradeChanged && !confirming) {
                  setConfirming(true);
                  setError(null);
                  return;
                }
                void save();
              }}
            >
              {t("childSave")}
            </Button>
            {dirty && !busy ? (
              <span className="text-xs text-fg-subtle" data-child-dirty={child.id}>
                {t("childUnsaved")}
              </span>
            ) : null}
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
