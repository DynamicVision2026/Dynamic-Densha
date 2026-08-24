import assert from "node:assert/strict";
import { test } from "node:test";
import { getComponentAssembly } from "../src/data/component-assembly.ts";
import { getStrokeAssembly } from "../src/data/stroke-assembly.ts";
import {
  echoSurfacesFor,
  isLegalEchoTransition,
  selectEchoSurface,
} from "../src/lib/echo-surfaces.ts";
import { getItem, gradeChoice, drawPublishedItems } from "../src/lib/items.ts";
import { shapeModeFor, structureType } from "../src/lib/kanji-structure.ts";
import { canPlaceComponent } from "../src/lib/component-assembly.ts";
import { COMPONENT_COMPLETE_ID } from "../src/lib/component-assembly.ts";
import { emptyProgress, evaluateProgress } from "../src/lib/progress-eval.ts";
import { getGradeParams } from "../src/lib/grade-params.ts";
import { isElementaryReading } from "../src/lib/readings.ts";

const G1 = getGradeParams(1);
const NOW = "2026-08-21T05:00:00.000Z";

test("echo surfaces only keep elementary readings", () => {
  for (const s of echoSurfacesFor("生")) {
    assert.equal(isElementaryReading("生", s.reading), true, s.id);
  }
});

test("echo never switches せい to う", () => {
  const next = selectEchoSurface({
    char: "生",
    kind: "reading",
    lastSurfaceId: "生:先生",
  });
  assert.ok(next);
  assert.equal(next.reading, "セイ");
  assert.notEqual(next.text, "生まれる");
  assert.equal(isLegalEchoTransition("生", "生:先生", "生:学生"), true);
  assert.equal(isLegalEchoTransition("生", "生:先生", "生:生まれる"), false);
  assert.equal(isLegalEchoTransition("生", "生:先生", next.id), true);
});

test("echo 右 from solo picks 右手 with みぎ, never ユウ", () => {
  const next = selectEchoSurface({
    char: "右",
    kind: "reading",
    lastSurfaceId: "右:solo",
  });
  assert.ok(next);
  assert.equal(next.text, "右手");
  assert.equal(next.reading, "みぎ");
  assert.equal(isLegalEchoTransition("右", "右:solo", "右:左右"), false);
});

test("echo drawer prefers a different word with the same reading", () => {
  const next = selectEchoSurface({
    char: "生",
    kind: "reading",
    lastSurfaceId: "生:solo",
  });
  assert.ok(next);
  assert.notEqual(next.id, "生:solo");
  const solo = echoSurfacesFor("生").find((s) => s.id === "生:solo");
  assert.ok(solo);
  assert.equal(next.reading, solo.reading);
});

test("echo published item reading stays inside elementary_readings", () => {
  const items = drawPublishedItems({
    kanji: "生",
    kinds: ["reading"],
    seed: "echo-test",
    maxPerKind: 1,
    maxTotal: 1,
    echo: { lastSuccessByKind: { reading: "生:先生" } },
  });
  assert.equal(items.length, 1);
  const item = items[0]!;
  assert.ok(item.payload.surface);
  assert.equal(item.payload.surface.reading, "セイ");
  const wrongUmareru = item.payload.choices.find((c) => c.label.includes("うま") || c.label === "うまれる");
  if (wrongUmareru) assert.equal(wrongUmareru.correct, false);
  const sei = item.payload.choices.find((c) => c.correct);
  assert.ok(sei);
  assert.equal(isElementaryReading("生", sei.label), true);
  assert.equal(gradeChoice(item, sei.id).correct, true);
});

test("novel surface failure repairs the light but does not demote", () => {
  let s = emptyProgress("生");
  s = evaluateProgress(s, { type: "completeEncounter", nowIso: NOW }, G1);
  s = evaluateProgress(s, { type: "completeUnderstand", nowIso: NOW }, G1);
  s = evaluateProgress(
    s,
    {
      type: "answer",
      kind: "reading",
      correct: true,
      isEcho: false,
      echoBatchDone: false,
      nowIso: NOW,
      shapeAvailable: true,
      surfaceId: "生:solo",
    },
    G1,
  );
  s = evaluateProgress(
    s,
    {
      type: "answer",
      kind: "meaning",
      correct: true,
      isEcho: false,
      echoBatchDone: false,
      nowIso: NOW,
      shapeAvailable: true,
      surfaceId: "生:solo",
    },
    G1,
  );
  s = evaluateProgress(
    s,
    {
      type: "answer",
      kind: "shape",
      correct: true,
      isEcho: false,
      echoBatchDone: false,
      nowIso: NOW,
      shapeAvailable: true,
      surfaceId: "生:solo",
    },
    G1,
  );
  assert.equal(s.status, "almost");
  const later = "2026-08-22T02:00:00.000Z";
  const failed = evaluateProgress(
    s,
    {
      type: "answer",
      kind: "reading",
      correct: false,
      isEcho: true,
      echoBatchDone: false,
      nowIso: later,
      shapeAvailable: true,
      surfaceId: "生:生きる",
    },
    G1,
  );
  assert.equal(failed.status, "almost");
  assert.equal(failed.lights.reading, false);
  assert.ok(failed.repairRequiredKinds.includes("reading"));
  assert.equal(failed.wrongCountByKind.reading, s.wrongCountByKind.reading);
  assert.equal(failed.consecutiveWrongByKind.reading, 0);
});

test("known surface failure still demotes echo to fix", () => {
  let s = emptyProgress("生");
  s = evaluateProgress(s, { type: "completeEncounter", nowIso: NOW }, G1);
  s = evaluateProgress(s, { type: "completeUnderstand", nowIso: NOW }, G1);
  for (const kind of ["reading", "meaning", "shape"] as const) {
    s = evaluateProgress(
      s,
      {
        type: "answer",
        kind,
        correct: true,
        isEcho: false,
        echoBatchDone: false,
        nowIso: NOW,
        shapeAvailable: true,
        surfaceId: "生:solo",
      },
      G1,
    );
  }
  const later = "2026-08-22T02:00:00.000Z";
  s = evaluateProgress(
    s,
    {
      type: "answer",
      kind: "reading",
      correct: false,
      isEcho: true,
      echoBatchDone: false,
      nowIso: later,
      shapeAvailable: true,
      surfaceId: "生:solo",
    },
    G1,
  );
  assert.equal(s.status, "fix");
  assert.equal(s.wrongCountByKind.reading, 1);
  assert.equal(s.consecutiveWrongByKind.reading, 1);
  assert.equal(s.lights.reading, false);
});

test("structure: 木/日/川/山 stroke, 林/明/森 component", () => {
  assert.equal(structureType("木"), "primitive");
  assert.equal(structureType("日"), "primitive");
  assert.equal(structureType("川"), "primitive");
  assert.equal(structureType("山"), "primitive");
  assert.equal(shapeModeFor("山"), "stroke");
  assert.ok(getStrokeAssembly("山"));
  assert.equal(getStrokeAssembly("林"), undefined);

  assert.equal(structureType("林"), "compound");
  assert.equal(structureType("明"), "compound");
  assert.equal(structureType("森"), "compound");
  assert.equal(shapeModeFor("林"), "component");
  assert.equal(shapeModeFor("明"), "component");
  assert.equal(shapeModeFor("森"), "component");
  assert.ok(getComponentAssembly("林"));
  assert.ok(getComponentAssembly("明"));
  assert.ok(getComponentAssembly("森"));
});

test("component assembly success grades as shape correct", () => {
  const item = getItem("林:shape:0", true);
  assert.ok(item?.payload.componentAssembly);
  assert.equal(item.payload.strokeAssembly, undefined);
  assert.equal(gradeChoice(item, COMPONENT_COMPLETE_ID).correct, true);
});

test("wrong component does not snap; matching label on next slot does", () => {
  const 明 = getComponentAssembly("明")!;
  assert.equal(canPlaceComponent(明, [], "明-1"), false);
  assert.equal(canPlaceComponent(明, [], "明-0"), true);
  assert.equal(canPlaceComponent(明, ["明-0"], "明-1"), true);
});

test("three novel failures do not send G1 to まよい", () => {
  let s = emptyProgress("花");
  s = evaluateProgress(s, { type: "completeEncounter", nowIso: NOW }, G1);
  s = evaluateProgress(s, { type: "completeUnderstand", nowIso: NOW }, G1);
  for (let i = 0; i < 3; i++) {
    s = evaluateProgress(
      s,
      {
        type: "answer",
        kind: "reading",
        correct: false,
        isEcho: false,
        echoBatchDone: false,
        nowIso: NOW,
        shapeAvailable: true,
        surfaceId: "花:花火",
      },
      G1,
    );
  }
  assert.notEqual(s.status, "lost");
  assert.equal(s.wrongCountByKind.reading, 0);
  assert.equal(s.lights.reading, false);
});

test("known surface in surfacesSeenSuccess + wrong uses fix/lost counters", () => {
  let s = emptyProgress("花");
  s = evaluateProgress(s, { type: "completeEncounter", nowIso: NOW }, G1);
  s = evaluateProgress(s, { type: "completeUnderstand", nowIso: NOW }, G1);
  s = evaluateProgress(
    s,
    {
      type: "answer",
      kind: "reading",
      correct: true,
      isEcho: false,
      echoBatchDone: false,
      nowIso: NOW,
      shapeAvailable: true,
      surfaceId: "花:花火",
    },
    G1,
  );
  assert.ok(s.surfacesSeenSuccess.includes("花:花火"));
  assert.equal(s.wrongCountByKind.reading, 0);
  assert.equal(s.consecutiveWrongByKind.reading, 0);

  s = evaluateProgress(
    s,
    {
      type: "answer",
      kind: "reading",
      correct: false,
      isEcho: false,
      echoBatchDone: false,
      nowIso: NOW,
      shapeAvailable: true,
      surfaceId: "花:花火",
    },
    G1,
  );
  assert.equal(s.status, "fix");
  assert.equal(s.wrongCountByKind.reading, 1);
  assert.equal(s.consecutiveWrongByKind.reading, 1);
  assert.equal(s.lights.reading, false);
  assert.ok(s.repairRequiredKinds.includes("reading"));

  for (let i = 0; i < 2; i++) {
    s = evaluateProgress(
      s,
      {
        type: "answer",
        kind: "reading",
        correct: false,
        isEcho: false,
        echoBatchDone: false,
        nowIso: NOW,
        shapeAvailable: true,
        surfaceId: "花:花火",
      },
      G1,
    );
  }
  assert.equal(s.status, "lost");
  assert.equal(s.wrongCountByKind.reading, 3);
  assert.equal(s.consecutiveWrongByKind.reading, 3);
});
