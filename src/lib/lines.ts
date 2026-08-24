import { KANJI_LINES, type KanjiLine, type LineStation } from "../data/lines.ts";

/** Stations more than this many grades ahead are omitted from the in-car strip. */
export const LINE_GRADE_LOOKAHEAD = 2;

export type StripStation = LineStation & {
  unopened: boolean;
};

export type LineStripView = {
  line: KanjiLine;
  prev: StripStation | null;
  current: StripStation;
  next: StripStation | null;
};

export type LineMapView = {
  line: KanjiLine;
  stations: StripStation[];
};

export function linesContaining(kanji: string): KanjiLine[] {
  return KANJI_LINES.filter((line) => line.stations.some((s) => s.kanji === kanji));
}

export function primaryLineFor(kanji: string): KanjiLine | null {
  return linesContaining(kanji)[0] ?? null;
}

export function isOnLine(kanji: string, lineId: string): boolean {
  const line = KANJI_LINES.find((l) => l.id === lineId);
  return Boolean(line?.stations.some((s) => s.kanji === kanji));
}

export function withinGradeCap(station: LineStation, childGrade: number): boolean {
  return station.grade <= childGrade + LINE_GRADE_LOOKAHEAD;
}

export function isUnopenedStation(station: LineStation, activeGrade: number): boolean {
  return station.grade !== activeGrade;
}

export function isReachableStation(station: LineStation, activeGrade: number): boolean {
  return station.grade === activeGrade;
}

function toStripStation(station: LineStation, activeGrade: number): StripStation {
  return { ...station, unopened: isUnopenedStation(station, activeGrade) };
}

export function lineStripFor(
  kanji: string,
  childGrade: number,
): LineStripView | null {
  const line = primaryLineFor(kanji);
  if (!line) return null;
  const idx = line.stations.findIndex((s) => s.kanji === kanji);
  if (idx < 0) return null;
  const current = line.stations[idx]!;
  const prevRaw = idx > 0 ? line.stations[idx - 1]! : null;
  const nextRaw = idx < line.stations.length - 1 ? line.stations[idx + 1]! : null;
  const prev =
    prevRaw && withinGradeCap(prevRaw, childGrade) ? toStripStation(prevRaw, childGrade) : null;
  const next =
    nextRaw && withinGradeCap(nextRaw, childGrade) ? toStripStation(nextRaw, childGrade) : null;
  return {
    line,
    prev,
    current: toStripStation(current, childGrade),
    next,
  };
}

/** Full editorial lines. Other-grade stations stay visible (muted), never a G1-only lie. */
export function mapLinesFor(activeGrade: number): LineMapView[] {
  return KANJI_LINES.map((line) => ({
    line,
    stations: line.stations.map((s) => toStripStation(s, activeGrade)),
  })).filter((row) => row.stations.length > 0);
}
