import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildDepartureBoard } from "../src/lib/departure-board.ts";
import { emptyProgress, type ProgressState } from "../src/lib/progress-eval.ts";
import { boardStageCards, pickDeparture } from "../src/lib/pick-departure.ts";

function carsFrom(chars: string[], status: ProgressState["status"] = "new") {
  return chars.map((char) => ({ char, status, echoDue: false }));
}

test("pickDeparture prefers returns then new then inspect; never empty", () => {
  const progress = new Map<string, ProgressState>([
    ["右", { ...emptyProgress("右"), status: "almost", echoDueAt: "2020-01-01T00:00:00.000Z" }],
    ["一", { ...emptyProgress("一"), status: "new" }],
    ["王", { ...emptyProgress("王"), status: "perfect", perfectAt: "2026-01-01T00:00:00.000Z" }],
  ]);
  const board = buildDepartureBoard({
    progress,
    inspections: {},
    plan: {
      weekStart: "2026-08-24",
      cursor: 0,
      weeklyNewCap: 5,
      newKanji: ["一", "雨"],
      returnKanji: ["右"],
    },
    nowIso: "2026-08-25T00:00:00.000Z",
  });
  const cars = carsFrom(["一", "右", "雨", "円", "王"]);
  const cards = boardStageCards({
    board,
    echoQueue: [{ kanji: "右" }],
    cars,
  });
  assert.equal(cards[0]?.kind, "return");
  assert.equal(cards[0]?.kanji, "右");
  assert.ok(cards.some((c) => c.kind === "new" && c.kanji === "一"));
  const due = pickDeparture({ board, echoQueue: [{ kanji: "右" }], cars });
  assert.equal(due.empty, false);
  assert.equal(due.kanji, "右");
});

test("empty board still yields a live free-ride station", () => {
  const cars = carsFrom(["花", "貝"], "new");
  const out = pickDeparture({
    board: { today: [], tomorrow: [], newStations: [], returnStations: [] },
    echoQueue: [],
    cars,
  });
  assert.equal(out.empty, true);
  assert.equal(out.kanji, "花");
});

test("inspections on the stage are capped at 3", () => {
  const board = {
    today: [
      { kanji: "一", kind: "inspect" as const },
      { kanji: "右", kind: "inspect" as const },
      { kanji: "雨", kind: "inspect" as const },
      { kanji: "円", kind: "inspect" as const },
      { kanji: "王", kind: "inspect" as const },
    ],
    tomorrow: [],
    newStations: [],
    returnStations: [],
  };
  const cards = boardStageCards({
    board,
    echoQueue: [],
    cars: carsFrom(["一", "右", "雨", "円", "王"], "perfect"),
  });
  assert.equal(cards.filter((c) => c.kind === "inspect").length, 3);
});

test("child home chrome has no peer nav / login / workshop / demo tile", () => {
  const home = readFileSync("src/components/child-home.tsx", "utf8");
  const demo = readFileSync("src/routes/demo/index.tsx", "utf8");
  const app = readFileSync("src/routes/app/index.tsx", "utf8");
  const shell = readFileSync("src/components/app-shell.tsx", "utf8");
  assert.match(home, /しゅっぱつ|depart/);
  assert.match(home, /ParentDoor/);
  assert.equal(/WorldNav/.test(home), false);
  assert.equal(/WatchDemoButton/.test(home + demo + app), false);
  assert.equal(/workshopTry/.test(home + demo), false);
  assert.equal(/loginParent/.test(home), false);
  assert.equal(/WorldNav/.test(shell), false);
});

test("ride shell is 100dvh with a stable action zone; parent door holds 1.5s", () => {
  const ride = readFileSync("src/components/ride-shell.tsx", "utf8");
  const child = readFileSync("src/components/child-shell.tsx", "utf8");
  const door = readFileSync("src/components/parent-door.tsx", "utf8");
  const session = readFileSync("src/components/kanji-session.tsx", "utf8");
  assert.match(child, /h-dvh/);
  assert.match(child, /fixed inset-0/);
  assert.match(ride, /data-ride-action/);
  assert.match(ride, /flex-\[0_0_42%\]/);
  assert.match(session, /RideShell/);
  assert.match(door, /HOLD_MS = 1500/);
  assert.match(door, /aria-label/);
  const stageChunk = ride.split("data-ride-stage")[1]?.split("data-ride-action")[0] ?? "";
  assert.equal(/overflow-y-auto/.test(stageChunk), false);
});

test("index launches child 発車標, not a marketing wall", () => {
  const index = readFileSync("src/routes/index.tsx", "utf8");
  assert.match(index, /Navigate to="\/demo"/);
  assert.equal(/ctaRide/.test(index), false);
});

test("home landscape keeps しゅっぱつ bottom-center, not a side rail", () => {
  const home = readFileSync("src/components/child-home.tsx", "utf8");
  assert.match(home, /landscape:w-\[40%\]/);
  assert.match(home, /data-child-action/);
  assert.equal(/side-rail|landscape:flex-row/.test(home), false);
});

test("map is overlay state, not a child tab; old map routes replace to home", () => {
  const overlay = readFileSync("src/components/map-overlay.tsx", "utf8");
  const home = readFileSync("src/components/child-home.tsx", "utf8");
  const demoMap = readFileSync("src/routes/demo/map.tsx", "utf8");
  const appMap = readFileSync("src/routes/app/map.tsx", "utf8");
  assert.match(home, /MapOverlay/);
  assert.match(overlay, /data-map-overlay/);
  assert.match(overlay, /fixed inset-0/);
  assert.match(overlay, /aria-modal/);
  assert.equal(/createFileRoute/.test(overlay), false);
  assert.match(demoMap, /to="\/demo"/);
  assert.match(demoMap, /replace/);
  assert.match(appMap, /to="\/app"/);
  assert.match(appMap, /replace/);
  assert.equal(/workshopTry/.test(overlay), false);
});

test("parent door holds 1.5s for pointer and exposes immediate a11y control", () => {
  const door = readFileSync("src/components/parent-door.tsx", "utf8");
  assert.match(door, /HOLD_MS = 1500/);
  assert.match(door, /data-parent-a11y/);
  assert.match(door, /parentAria/);
  assert.match(door, /aria-hidden/);
});

test("empty board copy stays live as じゆうに のる", () => {
  const home = readFileSync("src/components/child-home.tsx", "utf8");
  assert.match(home, /emptyBoard/);
  assert.match(home, /freeRide/);
  assert.match(home, /echoArrival/);
  assert.match(home, /data-empty-board/);
  assert.match(home, /data-free-ride/);
  assert.equal(/disabled/.test(home), false);
});

test("parent document is sticky + 900px; sitemap order progress → week → attention → paper", () => {
  const shell = readFileSync("src/components/app-shell.tsx", "utf8");
  const report = readFileSync("src/components/parent-report.tsx", "utf8");
  const demo = readFileSync("src/routes/demo/parent.tsx", "utf8");
  const app = readFileSync("src/routes/app/parent.tsx", "utf8");
  assert.match(shell, /sticky/);
  assert.match(shell, /backChild/);
  assert.match(demo, /max-w-\[900px\]/);
  assert.match(app, /max-w-\[900px\]/);
  assert.match(demo, /WatchDemoButton/);
  assert.equal(/WatchDemoButton/.test(readFileSync("src/components/child-home.tsx", "utf8")), false);
  const progressAt = report.indexOf("data-parent-progress");
  const weekAt = report.indexOf("data-parent-week");
  const attentionAt = report.indexOf("data-parent-attention");
  const paperAt = report.indexOf("data-parent-paper");
  assert.ok(progressAt >= 0 && weekAt > progressAt && attentionAt > weekAt && paperAt > attentionAt);
});
