import type { MessageKey } from "./i18n/messages.ts";

/** Relative next-残響 copy. JA calendar (Asia/Tokyo). Never “overdue / 遅れ”. */

export type ArrivalKind = "today" | "tomorrow" | "dayAfter" | "inDays";

export type EchoArrival = {
  kind: ArrivalKind;
  n: number;
};

const TOKYO = "Asia/Tokyo";

export function ymdInZone(iso: string, timeZone = TOKYO): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function dayIndex(ymd: string): number {
  return Math.floor(Date.parse(`${ymd}T00:00:00.000Z`) / 86_400_000);
}

export function echoArrival(
  dueIso: string,
  nowIso: string,
  timeZone = TOKYO,
): EchoArrival {
  const dueDay = ymdInZone(dueIso, timeZone);
  const nowDay = ymdInZone(nowIso, timeZone);
  const diff = dayIndex(dueDay) - dayIndex(nowDay);
  if (diff <= 0) return { kind: "today", n: 0 };
  if (diff === 1) return { kind: "tomorrow", n: 1 };
  if (diff === 2) return { kind: "dayAfter", n: 2 };
  return { kind: "inDays", n: diff };
}

export function echoArrivalMessage(kind: ArrivalKind): MessageKey {
  if (kind === "today") return "echoArrivalToday";
  if (kind === "tomorrow") return "echoArrivalTomorrow";
  if (kind === "dayAfter") return "echoArrivalDayAfter";
  return "echoArrivalInDays";
}

export function echoArrivalWhen(
  dueIso: string,
  nowIso: string,
  t: (key: MessageKey, vars?: Record<string, string | number>) => string,
  timeZone = TOKYO,
): string {
  const { kind, n } = echoArrival(dueIso, nowIso, timeZone);
  const key = echoArrivalMessage(kind);
  return kind === "inDays" ? t(key, { n }) : t(key);
}
