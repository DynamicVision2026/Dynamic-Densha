/**
 * Telling siblings apart when their names do not.
 *
 * A real household reached production with two children both called
 * "Brian2023" -- the parent typed the same thing twice, which the
 * duplicate-name prompt allows on purpose because siblings genuinely do share
 * names. Every chooser in the app then showed two identical buttons: the
 * parent assigned the annual pass to one of them, opened a board, saw
 * 「いまは のれません」, and had no way to know they were looking at the other
 * child. They reported it as a caching bug. It was not; the cache was right
 * and the labels were useless.
 *
 * So: a name is shown bare when it is unique among living siblings, and
 * qualified only when it is not. The qualifier is the cheapest fact that
 * actually separates them -- school year first, since a parent thinks in
 * 「1年生のほう」, and birth order within the app only when the year does not
 * help either.
 *
 * Alias-free so the plain node test runner can exercise it.
 */

export type LabelledChild = {
  id: string;
  name: string;
  grade: number;
  /** Creation order is the tiebreaker of last resort; ISO string or Date. */
  createdAt?: string;
};

export type ChildLabel = {
  id: string;
  name: string;
  /** Null when the name alone is unambiguous. */
  qualifier: string | null;
};

function normalize(name: string): string {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Labels for one household's children, in the order given.
 *
 * `gradeLabel` and `ordinalLabel` are injected rather than imported so this
 * stays free of the i18n module (and therefore testable): pass
 * `t("gradeN", { n })` and `t("childOrdinal", { n })`.
 */
export function childLabels(
  children: LabelledChild[],
  gradeLabel: (grade: number) => string,
  ordinalLabel: (index: number) => string,
): ChildLabel[] {
  const byName = new Map<string, LabelledChild[]>();
  for (const c of children) {
    const key = normalize(c.name);
    const list = byName.get(key);
    if (list) list.push(c);
    else byName.set(key, [c]);
  }

  return children.map((child) => {
    const clashing = byName.get(normalize(child.name)) ?? [child];
    if (clashing.length < 2) return { id: child.id, name: child.name, qualifier: null };

    // The year separates them only if it is actually different from every
    // other child sharing this name.
    const sameGrade = clashing.filter((c) => c.grade === child.grade);
    if (sameGrade.length === 1) {
      return { id: child.id, name: child.name, qualifier: gradeLabel(child.grade) };
    }

    // Same name AND same year: fall back to the order they were added, which
    // is the only thing left that differs. Ordered by createdAt where we have
    // it, else by the order the caller listed them (already created_at asc
    // from listChildren).
    const ordered = [...clashing].sort((a, b) => {
      const at = a.createdAt ? Date.parse(a.createdAt) : NaN;
      const bt = b.createdAt ? Date.parse(b.createdAt) : NaN;
      if (Number.isFinite(at) && Number.isFinite(bt) && at !== bt) return at - bt;
      return children.indexOf(a) - children.indexOf(b);
    });
    const index = ordered.findIndex((c) => c.id === child.id);
    return { id: child.id, name: child.name, qualifier: ordinalLabel(index + 1) };
  });
}

/** `name` when unambiguous, `name（qualifier）` when not. */
export function formatChildLabel(label: ChildLabel): string {
  return label.qualifier ? `${label.name}（${label.qualifier}）` : label.name;
}
