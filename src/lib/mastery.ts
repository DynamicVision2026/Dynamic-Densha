export const STATUSES = ["new", "lost", "fix", "almost", "perfect"] as const;
export type MasteryStatus = (typeof STATUSES)[number];

export const STATUS_META: Record<
  MasteryStatus,
  { ja: string; className: string; fg: string }
> = {
  new: {
    ja: "はじめて",
    className: "bg-status-new text-status-new-fg",
    fg: "text-status-new-fg",
  },
  lost: {
    ja: "まよい",
    className: "bg-status-lost text-status-lost-fg",
    fg: "text-status-lost-fg",
  },
  fix: {
    ja: "なおし",
    className: "bg-status-fix text-status-fix-fg",
    fg: "text-status-fix-fg",
  },
  almost: {
    ja: "だいたい",
    className: "bg-status-almost text-status-almost-fg",
    fg: "text-status-almost-fg",
  },
  perfect: {
    ja: "かんぺき",
    className: "bg-status-perfect text-status-perfect-fg",
    fg: "text-status-perfect-fg",
  },
};

export const PRACTICE_KINDS = ["reading", "meaning", "shape"] as const;
export type PracticeKind = (typeof PRACTICE_KINDS)[number];

export const KIND_META: Record<PracticeKind, { ja: string; hint: string }> = {
  reading: { ja: "よみ", hint: "音読み・訓読み" },
  meaning: { ja: "いみ", hint: "ことばの意味" },
  shape: { ja: "かたち", hint: "掛け軸の欠けを戻す" },
};

export function parseKinds(raw: string): PracticeKind[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is PracticeKind => (PRACTICE_KINDS as readonly string[]).includes(s));
}

export function nextStatus(input: {
  status: MasteryStatus;
  correct: boolean;
  correctStreak: number;
  wrongCount: number;
  completedKinds: PracticeKind[];
}): MasteryStatus {
  // Legacy helper. Phase 1 learning loop uses evaluateProgress in progress-eval.ts.
  // Kept so existing imports typecheck; does not grant perfect (echo-gated).
  if (!input.correct) {
    if (input.wrongCount >= 3) return "lost";
    return "fix";
  }
  if (input.completedKinds.length >= 3) return "almost";
  if (input.wrongCount > 0) return "fix";
  if (input.completedKinds.length >= 1) return "almost";
  return input.status === "new" ? "new" : input.status;
}

export function isCleared(status: MasteryStatus): boolean {
  return status === "almost" || status === "perfect";
}
