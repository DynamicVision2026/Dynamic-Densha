import type { MasteryStatus } from "./mastery";
import type { DepartureBoard } from "./departure-board";

export type StripCar = {
  char: string;
  status: MasteryStatus;
  echoDue?: boolean;
};

export type StageKind = "return" | "new" | "inspect";

export type StageCard = {
  kanji: string;
  kind: StageKind;
  status: MasteryStatus;
  echoDue?: boolean;
};

const INSPECT_VISIBLE_CAP = 3;

function unique(chars: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const c of chars) {
    if (!c || seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  return out;
}

function statusOf(cars: StripCar[], kanji: string): MasteryStatus {
  return cars.find((c) => c.char === kanji)?.status ?? "new";
}

function echoOf(cars: StripCar[], kanji: string): boolean {
  return Boolean(cars.find((c) => c.char === kanji)?.echoDue);
}

/** Stage cards: returns → new → inspections (≤3). No scoring. */
export function boardStageCards(input: {
  board: DepartureBoard | null | undefined;
  echoQueue: { kanji: string }[];
  cars: StripCar[];
}): StageCard[] {
  const board = input.board;
  const returns = unique([
    ...input.echoQueue.map((r) => r.kanji),
    ...(board?.today ?? []).filter((c) => c.kind === "echo").map((c) => c.kanji),
    ...(board?.returnStations ?? []),
  ]);
  const news = unique(board?.newStations ?? []).filter((k) => !returns.includes(k));
  const inspects = unique(
    (board?.today ?? []).filter((c) => c.kind === "inspect").map((c) => c.kanji),
  )
    .filter((k) => !returns.includes(k) && !news.includes(k))
    .slice(0, INSPECT_VISIBLE_CAP);

  const cards: StageCard[] = [];
  for (const kanji of returns) {
    cards.push({
      kanji,
      kind: "return",
      status: statusOf(input.cars, kanji),
      echoDue: echoOf(input.cars, kanji) || true,
    });
  }
  for (const kanji of news) {
    cards.push({
      kanji,
      kind: "new",
      status: statusOf(input.cars, kanji),
      echoDue: echoOf(input.cars, kanji),
    });
  }
  for (const kanji of inspects) {
    cards.push({
      kanji,
      kind: "inspect",
      status: statusOf(input.cars, kanji),
      echoDue: echoOf(input.cars, kanji),
    });
  }
  return cards;
}

/**
 * Next しゅっぱつ target. Due cars first; otherwise a free station.
 * Primary is never empty — empty board still returns a live free-ride kanji.
 */
export function pickDeparture(input: {
  board: DepartureBoard | null | undefined;
  echoQueue: { kanji: string }[];
  cars: StripCar[];
}): { kanji: string; empty: boolean } {
  const cards = boardStageCards(input);
  if (cards[0]) return { kanji: cards[0].kanji, empty: false };
  const free =
    input.cars.find((c) => c.status === "new") ??
    input.cars.find((c) => c.status === "fix" || c.status === "lost") ??
    input.cars.find((c) => c.status === "almost") ??
    input.cars[0];
  return { kanji: free?.char ?? "一", empty: true };
}
