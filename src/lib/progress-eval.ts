import type { MasteryStatus, PracticeKind } from "./mastery";

/**
 * Timestamps are ISO-8601 UTC. Echo due is an absolute delay from `almost_at`
 * (`echo_delay_hours`), not a local-calendar "next morning".
 *
 * Spec v0.2 §6: all status/light transitions go through evaluateProgress.
 * Reading correctness (小学校 音訓 ○ set) and shape skeleton policy live in the
 * content layer and arrive here as `event.correct`.
 *
 * U9: perfect requires `perfect_echo_required` successful spaced 再訪 (default 2).
 * Same-session success still stops at almost.
 *
 * P0-1: echo ordinal/spacing comes from stored `echoDueAt` + `almost` status.
 * Client `isEcho` / `echoBatchDone` are UI hints only — never authority.
 */

export type Lights = {
  reading: boolean;
  meaning: boolean;
  shape: boolean;
};

export type EvalParams = {
  echo_delay_hours: number;
  echo_per_day_cap: number;
  force_reteach_on_wrong: boolean;
  lost_wrong_threshold: number;
  lost_wrong_lifetime_threshold: number;
  reading_enabled: boolean;
  meaning_enabled: boolean;
  shape_enabled: boolean;
  echo_second_delay_hours?: number;
  perfect_echo_required?: number;
  perfect_decay_enabled?: boolean;
  decay_days?: number;
  perfect_decay_days?: number;
};

export type ProgressState = {
  kanji: string;
  status: MasteryStatus;
  lights: Lights;
  encounterCompleted: boolean;
  understandCompleted: boolean;
  seenAt: string | null;
  lastPracticeAt: string | null;
  almostAt: string | null;
  echoDueAt: string | null;
  perfectAt: string | null;
  correctStreakByKind: LightsCount;
  wrongCountByKind: LightsCount;
  consecutiveWrongByKind: LightsCount;
  repairRequiredKinds: PracticeKind[];
  attempts: number;
  /** Surface ids that have been answered correctly at least once. */
  surfacesSeenSuccess: string[];
  lastSuccessByKind: Partial<Record<PracticeKind, string>>;
  /** Successful 再訪 batches completed while almost. Perfect at threshold. */
  echoSuccessCount: number;
};

type LightsCount = Record<PracticeKind, number>;

export type ProgressEvent =
  | { type: "open"; nowIso: string }
  | { type: "completeEncounter"; nowIso: string }
  | { type: "completeUnderstand"; nowIso: string }
  | {
      type: "answer";
      kind: PracticeKind;
      correct: boolean;
      isEcho: boolean;
      echoBatchDone: boolean;
      nowIso: string;
      shapeAvailable: boolean;
      /** Echo / practice surface id. Novel surfaces do not demote status. */
      surfaceId?: string | null;
      /** U10 乗り間違い: repair the light, never increment lost counters. */
      gentle?: boolean;
    };

export type BeatId = "encounter" | "understand" | "practice" | "echo" | "feedback";

const ZERO: LightsCount = { reading: 0, meaning: 0, shape: 0 };
const DARK: Lights = { reading: false, meaning: false, shape: false };
const DEFAULT_ECHO_REQUIRED = 2;
const DEFAULT_SECOND_ECHO_HOURS = 168;
const DEFAULT_DECAY_DAYS = 21;

export function emptyProgress(kanji: string): ProgressState {
  return {
    kanji,
    status: "new",
    lights: { ...DARK },
    encounterCompleted: false,
    understandCompleted: false,
    seenAt: null,
    lastPracticeAt: null,
    almostAt: null,
    echoDueAt: null,
    perfectAt: null,
    correctStreakByKind: { ...ZERO },
    wrongCountByKind: { ...ZERO },
    consecutiveWrongByKind: { ...ZERO },
    repairRequiredKinds: [],
    attempts: 0,
    surfacesSeenSuccess: [],
    lastSuccessByKind: {},
    echoSuccessCount: 0,
  };
}

export function requiredLights(
  params: Pick<EvalParams, "reading_enabled" | "meaning_enabled" | "shape_enabled">,
  shapeAvailable: boolean,
): PracticeKind[] {
  const out: PracticeKind[] = [];
  if (params.reading_enabled) out.push("reading");
  if (params.meaning_enabled) out.push("meaning");
  if (params.shape_enabled && shapeAvailable) out.push("shape");
  return out;
}

export function allRequiredLightsOn(
  state: ProgressState,
  required: PracticeKind[],
): boolean {
  return required.every((k) => state.lights[k]);
}

export function echoIsDue(state: ProgressState, nowIso: string): boolean {
  if (state.status !== "almost" || !state.echoDueAt) return false;
  return Date.parse(nowIso) >= Date.parse(state.echoDueAt);
}

/** Scoring 残響: stored progress only. Same predicate as echoIsDue. */
export function echoScoringEligible(state: ProgressState, nowIso: string): boolean {
  return echoIsDue(state, nowIso);
}

/** True when the visit is later than ~2× the scheduled delay. Never demotes. */
export function echoIsStale(
  state: ProgressState,
  nowIso: string,
  params: Pick<EvalParams, "echo_delay_hours" | "echo_second_delay_hours">,
): boolean {
  if (!echoIsDue(state, nowIso) || !state.echoDueAt) return false;
  const delayH =
    (state.echoSuccessCount ?? 0) >= 1
      ? (params.echo_second_delay_hours ?? DEFAULT_SECOND_ECHO_HOURS)
      : params.echo_delay_hours;
  return Date.parse(nowIso) >= Date.parse(state.echoDueAt) + delayH * 3600 * 1000;
}

export function echoAvailable(
  state: ProgressState,
  nowIso: string,
  echoesStartedToday: number,
  params: Pick<EvalParams, "echo_per_day_cap">,
): boolean {
  if (!echoIsDue(state, nowIso)) return false;
  return echoesStartedToday < params.echo_per_day_cap;
}

export function echoesNeeded(params: EvalParams): number {
  return params.perfect_echo_required ?? DEFAULT_ECHO_REQUIRED;
}

function uniqueKinds(kinds: PracticeKind[]): PracticeKind[] {
  return Array.from(new Set(kinds));
}

function maybeAlmost(
  state: ProgressState,
  params: EvalParams,
  shapeAvailable: boolean,
  nowIso: string,
): ProgressState {
  if (state.status === "perfect" || state.status === "almost") return state;
  const required = requiredLights(params, shapeAvailable);
  if (
    state.encounterCompleted &&
    state.understandCompleted &&
    allRequiredLightsOn(state, required) &&
    state.repairRequiredKinds.length === 0
  ) {
    const delayMs = params.echo_delay_hours * 3600 * 1000;
    return {
      ...state,
      status: "almost",
      almostAt: nowIso,
      echoDueAt: new Date(Date.parse(nowIso) + delayMs).toISOString(),
      echoSuccessCount: 0,
    };
  }
  return state;
}

function maybeDecay(state: ProgressState, nowIso: string, params: EvalParams): ProgressState {
  if (state.status !== "perfect") return state;
  if (!params.perfect_decay_enabled) return state;
  const days = params.perfect_decay_days ?? params.decay_days ?? DEFAULT_DECAY_DAYS;
  const last = state.lastPracticeAt ?? state.perfectAt;
  if (!last) return state;
  if (Date.parse(nowIso) - Date.parse(last) < days * 86_400_000) return state;
  const delayMs = params.echo_delay_hours * 3600 * 1000;
  const need = echoesNeeded(params);
  return {
    ...state,
    status: "almost",
    echoDueAt: new Date(Date.parse(nowIso) + delayMs).toISOString(),
    echoSuccessCount: Math.max(0, need - 1),
  };
}

/** Spec v0.2 §6.5 — previous status is `state.status` (not yet overwritten). */
function applyFailureStatus(
  state: ProgressState,
  kind: PracticeKind,
  params: EvalParams,
): ProgressState {
  const consecutive = state.consecutiveWrongByKind[kind] ?? 0;
  const lifetime = state.wrongCountByKind[kind] ?? 0;
  const dropEcho = (status: MasteryStatus): ProgressState => ({
    ...state,
    status,
    echoSuccessCount: 0,
  });
  if (
    consecutive >= params.lost_wrong_threshold ||
    lifetime >= params.lost_wrong_lifetime_threshold
  ) {
    return dropEcho("lost");
  }
  if (state.repairRequiredKinds.length === 0) return state;
  if (state.status === "almost") {
    return dropEcho("fix");
  }
  if (state.status === "new" || state.status === "fix" || state.status === "lost") {
    return { ...state, status: "fix" };
  }
  return state;
}

export function hydrateProgress(raw: ProgressState): ProgressState {
  const base = emptyProgress(raw.kanji ?? "");
  return {
    ...base,
    ...raw,
    lights: { ...base.lights, ...raw.lights },
    correctStreakByKind: { ...base.correctStreakByKind, ...raw.correctStreakByKind },
    wrongCountByKind: { ...base.wrongCountByKind, ...raw.wrongCountByKind },
    consecutiveWrongByKind: { ...base.consecutiveWrongByKind, ...raw.consecutiveWrongByKind },
    repairRequiredKinds: raw.repairRequiredKinds ?? [],
    surfacesSeenSuccess: raw.surfacesSeenSuccess ?? [],
    lastSuccessByKind: raw.lastSuccessByKind ?? {},
    echoSuccessCount:
      typeof raw.echoSuccessCount === "number"
        ? raw.echoSuccessCount
        : raw.status === "perfect"
          ? 2
          : 0,
  };
}

export function evaluateProgress(
  prevInput: ProgressState,
  event: ProgressEvent,
  params: EvalParams,
): ProgressState {
  const prev = hydrateProgress(prevInput);

  if (event.type === "open") {
    const withSeen = prev.seenAt ? prev : { ...prev, seenAt: event.nowIso };
    return maybeDecay(withSeen, event.nowIso, params);
  }

  if (event.type === "completeEncounter") {
    if (prev.encounterCompleted) return maybeDecay(prev, event.nowIso, params);
    return maybeAlmost(
      { ...prev, encounterCompleted: true },
      params,
      true,
      event.nowIso,
    );
  }

  if (event.type === "completeUnderstand") {
    if (prev.understandCompleted) return maybeDecay(prev, event.nowIso, params);
    return maybeAlmost(
      { ...prev, understandCompleted: true },
      params,
      true,
      event.nowIso,
    );
  }

  const { kind, correct, nowIso, shapeAvailable, surfaceId, gentle } = event;
  const novelSurface = Boolean(surfaceId) && !prev.surfacesSeenSuccess.includes(surfaceId!);
  const echoEligible = echoIsDue(prev, nowIso);

  if (prev.status === "perfect") {
    const decayed = maybeDecay(prev, nowIso, params);
    if (decayed.status !== "perfect") return decayed;
    return { ...prev, lastPracticeAt: nowIso, attempts: prev.attempts + 1 };
  }

  let next: ProgressState = {
    ...prev,
    lights: { ...prev.lights },
    correctStreakByKind: { ...prev.correctStreakByKind },
    wrongCountByKind: { ...prev.wrongCountByKind },
    consecutiveWrongByKind: { ...prev.consecutiveWrongByKind },
    repairRequiredKinds: [...prev.repairRequiredKinds],
    surfacesSeenSuccess: [...prev.surfacesSeenSuccess],
    lastSuccessByKind: { ...prev.lastSuccessByKind },
    lastPracticeAt: nowIso,
    attempts: prev.attempts + 1,
  };

  if (correct) {
    next.lights[kind] = true;
    next.repairRequiredKinds = next.repairRequiredKinds.filter((k) => k !== kind);
    next.consecutiveWrongByKind[kind] = 0;
    next.correctStreakByKind[kind] = (next.correctStreakByKind[kind] ?? 0) + 1;
    if (surfaceId && !next.surfacesSeenSuccess.includes(surfaceId)) {
      next.surfacesSeenSuccess.push(surfaceId);
    }
    if (surfaceId) next.lastSuccessByKind[kind] = surfaceId;
  } else {
    next.lights[kind] = false;
    next.repairRequiredKinds = uniqueKinds([...next.repairRequiredKinds, kind]);
    if (!novelSurface && !gentle) {
      next.wrongCountByKind[kind] = (next.wrongCountByKind[kind] ?? 0) + 1;
      next.consecutiveWrongByKind[kind] = (next.consecutiveWrongByKind[kind] ?? 0) + 1;
      next = applyFailureStatus(next, kind, params);
    }
  }

  const required = requiredLights(params, shapeAvailable);
  const ready =
    next.encounterCompleted &&
    next.understandCompleted &&
    allRequiredLightsOn(next, required) &&
    next.repairRequiredKinds.length === 0;

  if (echoEligible) {
    if (correct && ready) {
      const count = (next.echoSuccessCount ?? 0) + 1;
      const need = echoesNeeded(params);
      if (count >= need) {
        return {
          ...next,
          echoSuccessCount: count,
          status: "perfect",
          perfectAt: next.perfectAt ?? nowIso,
          echoDueAt: null,
        };
      }
      const delayH = params.echo_second_delay_hours ?? DEFAULT_SECOND_ECHO_HOURS;
      return {
        ...next,
        echoSuccessCount: count,
        status: "almost",
        echoDueAt: new Date(Date.parse(nowIso) + delayH * 3600 * 1000).toISOString(),
      };
    }
    if (!correct) {
      if (novelSurface || gentle) return next;
      return { ...next, status: "fix", echoSuccessCount: 0 };
    }
    return next;
  }

  return maybeAlmost(next, params, shapeAvailable, nowIso);
}

export function suggestBeat(
  state: ProgressState,
  params: EvalParams,
  shapeAvailable: boolean,
  nowIso: string,
  echoesStartedToday: number,
): BeatId {
  if (state.status === "perfect") return "feedback";
  if (!state.encounterCompleted) return "encounter";
  if (!state.understandCompleted) return "understand";
  if (echoAvailable(state, nowIso, echoesStartedToday, params)) return "echo";
  const required = requiredLights(params, shapeAvailable);
  if (!allRequiredLightsOn(state, required)) return "practice";
  return "feedback";
}

export function utcDay(iso: string): string {
  return iso.slice(0, 10);
}
