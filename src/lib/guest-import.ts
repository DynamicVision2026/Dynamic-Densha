import { getKanji } from "../data/kyoiku.ts";
import { getGradeParams } from "./grade-params.ts";
import { markInspectionOpened, type InspectionRow } from "./inspection.ts";
import type { MasteryStatus, PracticeKind } from "./mastery.ts";
import {
  emptyProgress,
  hydrateProgress,
  scheduleEchoFromNow,
  type Lights,
  type ProgressState,
} from "./progress-eval.ts";

/** Welcome-train door cars. Never import. */
export const DECORATIVE_DEMO_CARS = new Set(["音", "下", "火"]);

export const DEMO_PROGRESS_KEY = "densha.demo.progress.v3";
export const GUEST_MIGRATED_KEY = "densha.guest.migrated.v1";

export type GuestProgressPayload = {
  kanji: string;
  status: MasteryStatus;
  lights: Lights;
  encounterCompleted: boolean;
  understandCompleted: boolean;
  surfacesSeenSuccess: string[];
  repairRequiredKinds: PracticeKind[];
  wrongCountByKind: ProgressState["wrongCountByKind"];
  consecutiveWrongByKind: ProgressState["consecutiveWrongByKind"];
  correctStreakByKind: ProgressState["correctStreakByKind"];
  echoSuccessCount: number;
  lastSuccessByKind: ProgressState["lastSuccessByKind"];
  attempts: number;
};

function asStatus(raw: unknown): MasteryStatus {
  if (raw === "lost" || raw === "fix" || raw === "almost" || raw === "perfect") return raw;
  return "new";
}

export function isImportableGuestRow(row: Pick<GuestProgressPayload, "kanji" | "attempts">): boolean {
  if (DECORATIVE_DEMO_CARS.has(row.kanji)) return false;
  return (row.attempts ?? 0) > 0;
}

export function toGuestPayload(raw: ProgressState): GuestProgressPayload {
  const h = hydrateProgress(raw);
  return {
    kanji: h.kanji,
    status: asStatus(h.status),
    lights: { ...h.lights },
    encounterCompleted: h.encounterCompleted,
    understandCompleted: h.understandCompleted,
    surfacesSeenSuccess: [...(h.surfacesSeenSuccess ?? [])],
    repairRequiredKinds: [...(h.repairRequiredKinds ?? [])],
    wrongCountByKind: { ...h.wrongCountByKind },
    consecutiveWrongByKind: { ...h.consecutiveWrongByKind },
    correctStreakByKind: { ...h.correctStreakByKind },
    echoSuccessCount: h.echoSuccessCount ?? 0,
    lastSuccessByKind: { ...h.lastSuccessByKind },
    attempts: h.attempts ?? 0,
  };
}

export function parseGuestProgressMap(raw: unknown): GuestProgressPayload[] {
  if (!raw || typeof raw !== "object") return [];
  const out: GuestProgressPayload[] = [];
  for (const row of Object.values(raw as Record<string, unknown>)) {
    if (!row || typeof row !== "object") continue;
    const kanji = String((row as { kanji?: unknown }).kanji ?? "");
    if (!kanji) continue;
    const payload = toGuestPayload({ ...(row as ProgressState), kanji });
    if (!isImportableGuestRow(payload)) continue;
    out.push(payload);
  }
  return out;
}

/**
 * Option 3: keep lamps + five-state. Re-derive echo / 点検 from serverNow.
 * Status is copied, not re-scored.
 *
 * PI-6: a claimed "perfect" (echoSuccessCount >= 2) is only trusted when
 * `attestedElapsedMs` shows real wall-clock time (server-attested, not the
 * guest device's own clock) actually separated the two echo successes by at
 * least `echo_second_delay_hours`. Omit the argument (undefined) to trust the
 * claim as before — existing callers and tests that never gathered
 * attestations keep working. Pass `null` when attestations are missing, or a
 * too-small number, to force the same demotion the echoSuccessCount < 2
 * branch already gets.
 */
export function rebuildImportedProgress(
  guest: GuestProgressPayload,
  serverNow: string,
  childGrade = 1,
  attestedElapsedMs?: number | null,
): { progress: ProgressState; inspection: InspectionRow | null } {
  const params = getGradeParams(getKanji(guest.kanji)?.grade ?? childGrade);
  const kept: ProgressState = {
    ...emptyProgress(guest.kanji),
    status: guest.status,
    lights: { ...guest.lights },
    encounterCompleted: guest.encounterCompleted,
    understandCompleted: guest.understandCompleted,
    surfacesSeenSuccess: [...guest.surfacesSeenSuccess],
    repairRequiredKinds: [...guest.repairRequiredKinds],
    wrongCountByKind: { ...guest.wrongCountByKind },
    consecutiveWrongByKind: { ...guest.consecutiveWrongByKind },
    correctStreakByKind: { ...guest.correctStreakByKind },
    echoSuccessCount: guest.echoSuccessCount,
    lastSuccessByKind: { ...guest.lastSuccessByKind },
    attempts: guest.attempts,
    seenAt: null,
    lastPracticeAt: null,
    almostAt: null,
    echoDueAt: null,
    perfectAt: null,
  };

  if (guest.status === "almost") {
    const sched = scheduleEchoFromNow(serverNow, params, guest.echoSuccessCount);
    return {
      progress: {
        ...kept,
        status: "almost",
        almostAt: sched.almostAt,
        echoDueAt: sched.echoDueAt,
      },
      inspection: null,
    };
  }

  if (guest.status === "perfect") {
    const requiredMs = params.echo_second_delay_hours * 3600 * 1000;
    const verified =
      attestedElapsedMs === undefined ||
      (attestedElapsedMs !== null && attestedElapsedMs >= requiredMs);
    if (guest.echoSuccessCount >= 2 && verified) {
      return {
        progress: {
          ...kept,
          status: "perfect",
          perfectAt: serverNow,
          echoSuccessCount: guest.echoSuccessCount,
        },
        inspection: markInspectionOpened(guest.kanji, serverNow),
      };
    }
    const sched = scheduleEchoFromNow(serverNow, params, guest.echoSuccessCount);
    return {
      progress: {
        ...kept,
        status: "almost",
        almostAt: sched.almostAt,
        echoDueAt: sched.echoDueAt,
        perfectAt: null,
      },
      inspection: null,
    };
  }

  return { progress: kept, inspection: null };
}