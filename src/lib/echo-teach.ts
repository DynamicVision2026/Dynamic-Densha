import { utcDay } from "./progress-eval.ts";

const KEY = "densha.echo-taught.v1";

function readMap(): Record<string, string[]> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
  } catch {
    return {};
  }
}

function writeMap(map: Record<string, string[]>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function wasEchoTaughtToday(char: string, nowIso = new Date().toISOString()): boolean {
  const day = utcDay(nowIso);
  const list = readMap()[day] ?? [];
  return list.includes(char);
}

export function markEchoTaughtToday(char: string, nowIso = new Date().toISOString()) {
  const day = utcDay(nowIso);
  const map = readMap();
  const list = map[day] ?? [];
  if (!list.includes(char)) list.push(char);
  const kept: Record<string, string[]> = { [day]: list };
  writeMap(kept);
}
