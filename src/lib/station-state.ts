import { echoIsDue, type ProgressState } from "./progress-eval.ts";
import type { MessageKey } from "./i18n/messages.ts";

/**
 * The five 到着 situations a child's own screen distinguishes -- see the
 * engineering ticket's §B.2. Deliberately narrower than MasteryStatus: "new"
 * has nothing to say here (a character that has not been taught yet is not
 * a station state), and "perfect"/"fix"/"lost" each collapse to one situation
 * regardless of how the child got there.
 *
 * Urgency comes from precision and from decrease, not from information (the
 * ticket's own design principle) -- which is why this module has no notion
 * of an hour, a minute, or a countdown. It names a day, or names nothing.
 */
export type StationSituation = "reachedBlue" | "stillBlue" | "reachedGreen" | "repair" | "overdue";

export function stationSituation(progress: ProgressState, nowIso: string): StationSituation | null {
  if (progress.status === "perfect") return "reachedGreen";
  if (progress.status === "fix" || progress.status === "lost") return "repair";
  if (progress.status === "almost") {
    // Overdue is an invitation, never a lateness figure -- and it reads the
    // same whether the due date was missed by an hour or by ten days: this
    // module never counts how overdue something is, only whether it is.
    if (echoIsDue(progress, nowIso)) return "overdue";
    return (progress.echoSuccessCount ?? 0) >= 1 ? "stillBlue" : "reachedBlue";
  }
  return null;
}

export type StationLines = {
  line1: MessageKey | null;
  line2: MessageKey;
  line2Vars?: Record<string, string | number>;
};

/**
 * `arrivalWhen` is the real, exact day name (きょう/あした/あさって/{n}日後,
 * from echo-arrival.ts) for the FIRST echo window -- accurate because 20h
 * (or 36h for the older grades) naturally lands within a day or two, so
 * naming the real day costs nothing.
 *
 * The SECOND window (~168h / a week out) deliberately does NOT use that same
 * exact count: "なのかごろ" is fixed, regardless of whether this is really
 * day 6 or day 8, because a child who returns a day early must not feel
 * early, and the seven-day figure is a schedule, not a deadline. See the
 * ticket's own reasoning under §B.2.
 */
export function stationLines(situation: StationSituation, arrivalWhen: string): StationLines {
  switch (situation) {
    case "reachedBlue":
      return {
        line1: "stationReachedBlueLine1",
        line2: "stationReachedBlueLine2",
        line2Vars: { when: arrivalWhen },
      };
    case "stillBlue":
      return { line1: "stationStillBlueLine1", line2: "stationStillBlueLine2" };
    case "reachedGreen":
      return { line1: "stationReachedGreenLine1", line2: "stationReachedGreenLine2" };
    case "repair":
      return { line1: "stationRepairLine1", line2: "stationRepairLine2" };
    case "overdue":
      return { line1: null, line2: "stationOverdueLine2" };
  }
}
