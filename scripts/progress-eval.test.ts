import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { getGradeParams } from "../src/lib/grade-params.ts";
import {
  emptyProgress,
  evaluateProgress,
  echoIsDue,
  echoIsStale,
  echoAvailable,
  hydrateProgress,
  type EvalParams,
  type ProgressState,
} from "../src/lib/progress-eval.ts";
import type { PracticeKind } from "../src/lib/mastery.ts";

const G1: EvalParams = getGradeParams(1);
const NOW = "2026-08-21T05:00:00.000Z";

function taught(kanji = "王"): ProgressState {
  let s = emptyProgress(kanji);
  s = evaluateProgress(s, { type: "completeEncounter", nowIso: NOW }, G1);
  s = evaluateProgress(s, { type: "completeUnderstand", nowIso: NOW }, G1);
  return s;
}

function passKinds(state: ProgressState, kinds: PracticeKind[], params: EvalParams = G1): ProgressState {
  let s = state;
  for (const kind of kinds) {
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
        surfaceId: `${s.kanji}:solo`,
      },
      params,
    );
  }
  return s;
}

function echoOnce(state: ProgressState, nowIso: string, params: EvalParams = G1): ProgressState {
  return evaluateProgress(
    state,
    {
      type: "answer",
      kind: "reading",
      correct: true,
      isEcho: true,
      echoBatchDone: true,
      nowIso,
      shapeAvailable: true,
      surfaceId: `${state.kanji}:solo`,
    },
    params,
  );
}

function twoEchoes(state: ProgressState, params: EvalParams = G1): ProgressState {
  let s = state;
  s = echoOnce(s, s.echoDueAt ?? NOW, params);
  s = echoOnce(s, s.echoDueAt ?? NOW, params);
  return s;
}

test("same-session lights only reach almost, never perfect", () => {
  const s = passKinds(taught(), ["reading", "meaning", "shape"]);
  assert.equal(s.status, "almost");
  assert.equal(s.echoSuccessCount, 0);
  assert.equal(s.perfectAt, null);
});

test("first successful echo stays almost; second spaced echo is perfect", () => {
  let s = passKinds(taught(), ["reading", "meaning", "shape"]);
  s = echoOnce(s, s.echoDueAt ?? NOW);
  assert.equal(s.status, "almost");
  assert.equal(s.echoSuccessCount, 1);
  s = echoOnce(s, s.echoDueAt ?? NOW);
  assert.equal(s.status, "perfect");
  assert.equal(s.echoSuccessCount, 2);
  assert.ok(s.perfectAt);
});

test("known echo fail demotes to fix and clears echoSuccessCount", () => {
  let s = passKinds(taught(), ["reading", "meaning", "shape"]);
  s = echoOnce(s, "2026-08-22T02:00:00.000Z");
  assert.equal(s.echoSuccessCount, 1);
  s = evaluateProgress(
    s,
    {
      type: "answer",
      kind: "reading",
      correct: false,
      isEcho: true,
      echoBatchDone: true,
      nowIso: "2026-08-25T02:00:00.000Z",
      shapeAvailable: true,
      surfaceId: `${s.kanji}:solo`,
    },
    G1,
  );
  assert.equal(s.status, "fix");
  assert.equal(s.echoSuccessCount, 0);
  assert.equal(s.lights.reading, false);
});

test("hydrate infers echoSuccessCount 2 for existing perfect rows", () => {
  const raw = emptyProgress("一");
  raw.status = "perfect";
  const { echoSuccessCount: _ignored, ...rest } = raw;
  const h = hydrateProgress({ ...rest, echoSuccessCount: undefined as unknown as number });
  assert.equal(h.echoSuccessCount, 2);
});

test("switching grade params changes lost threshold without changing the machine", () => {
  const g5 = getGradeParams(5);
  assert.equal(g5.lost_wrong_threshold, 4);
  assert.equal(g5.lost_wrong_lifetime_threshold, 7);
  let s = taught("金");
  for (let i = 0; i < 3; i++) {
    s = evaluateProgress(
      s,
      {
        type: "answer",
        kind: "meaning",
        correct: false,
        isEcho: false,
        echoBatchDone: false,
        nowIso: NOW,
        shapeAvailable: true,
      },
      g5,
    );
  }
  assert.equal(s.status, "fix");
  s = evaluateProgress(
    s,
    {
      type: "answer",
      kind: "meaning",
      correct: false,
      isEcho: false,
      echoBatchDone: false,
      nowIso: NOW,
      shapeAvailable: true,
    },
    g5,
  );
  assert.equal(s.status, "lost");
  let g1s = taught("金");
  for (let i = 0; i < 3; i++) {
    g1s = evaluateProgress(
      g1s,
      {
        type: "answer",
        kind: "meaning",
        correct: false,
        isEcho: false,
        echoBatchDone: false,
        nowIso: NOW,
        shapeAvailable: true,
      },
      G1,
    );
  }
  assert.equal(g1s.status, "lost");
});

test("perfect_echo_required from grade params (3 stays almost after 2)", () => {
  const need3: EvalParams = { ...G1, perfect_echo_required: 3 };
  let s = twoEchoes(passKinds(taught(), ["reading", "meaning", "shape"]), need3);
  assert.equal(s.status, "almost");
  assert.equal(s.echoSuccessCount, 2);
  s = echoOnce(s, s.echoDueAt ?? NOW, need3);
  assert.equal(s.status, "perfect");
});

test("echo_second_delay_hours comes from params", () => {
  const custom: EvalParams = { ...G1, echo_second_delay_hours: 48 };
  let s = passKinds(taught(), ["reading", "meaning", "shape"]);
  const later = "2026-08-22T02:00:00.000Z";
  s = echoOnce(s, later, custom);
  assert.equal(Date.parse(s.echoDueAt ?? "") - Date.parse(later), 48 * 3600 * 1000);
});

test("G1 second echo is due after ~168 hours, not 72", () => {
  let s = passKinds(taught(), ["reading", "meaning", "shape"]);
  const first = s.echoDueAt ?? NOW;
  s = echoOnce(s, first);
  assert.equal(s.status, "almost");
  assert.equal(s.echoSuccessCount, 1);
  assert.equal(G1.echo_second_delay_hours, 168);
  const plus72 = new Date(Date.parse(first) + 72 * 3600 * 1000).toISOString();
  assert.equal(echoIsDue(s, plus72), false);
  assert.equal(echoIsDue(s, s.echoDueAt ?? NOW), true);
  s = echoOnce(s, s.echoDueAt ?? NOW);
  assert.equal(s.status, "perfect");
});

test("decay flag off keeps perfect after long inactivity", () => {
  const s = twoEchoes(passKinds(taught(), ["reading", "meaning", "shape"]));
  assert.equal(s.status, "perfect");
  const later = evaluateProgress(s, { type: "open", nowIso: "2026-10-01T00:00:00.000Z" }, G1);
  assert.equal(later.status, "perfect");
});

test("decay flag on after decay_days returns to almost without clearing perfectAt", () => {
  const decaying: EvalParams = { ...G1, perfect_decay_enabled: true, decay_days: 21 };
  const s = twoEchoes(passKinds(taught(), ["reading", "meaning", "shape"]), decaying);
  assert.equal(s.status, "perfect");
  const firstPerfect = s.perfectAt;
  const laterIso = new Date(Date.parse(firstPerfect ?? NOW) + 22 * 86_400_000).toISOString();
  const later = evaluateProgress(s, { type: "open", nowIso: laterIso }, decaying);
  assert.equal(later.status, "almost");
  assert.equal(later.perfectAt, firstPerfect);
  assert.equal(later.echoSuccessCount, 1);
  assert.ok(later.echoDueAt);
});

test("perfect_decay_days on the flag uses the spec name", () => {
  const decaying: EvalParams = {
    ...G1,
    perfect_decay_enabled: true,
    perfect_decay_days: 21,
  };
  const s = twoEchoes(passKinds(taught(), ["reading", "meaning", "shape"]), decaying);
  assert.equal(s.status, "perfect");
  const laterIso = new Date(Date.parse(s.perfectAt ?? NOW) + 22 * 86_400_000).toISOString();
  const later = evaluateProgress(s, { type: "open", nowIso: laterIso }, decaying);
  assert.equal(later.status, "almost");
  assert.equal(later.perfectAt, s.perfectAt);
});

test("gentle wrong repairs the light but does not increment lost counters", () => {
  let s = passKinds(taught("右"), ["reading", "meaning", "shape"]);
  assert.equal(s.status, "almost");
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
      surfaceId: "右:confusable",
      gentle: true,
    },
    G1,
  );
  assert.ok(s.surfacesSeenSuccess.includes("右:confusable"));
  s = evaluateProgress(
    s,
    {
      type: "answer",
      kind: "shape",
      correct: false,
      isEcho: false,
      echoBatchDone: false,
      nowIso: NOW,
      shapeAvailable: true,
      surfaceId: "右:confusable",
      gentle: true,
    },
    G1,
  );
  assert.equal(s.status, "almost");
  assert.equal(s.lights.shape, false);
  assert.equal(s.wrongCountByKind.shape, 0);
  assert.equal(s.consecutiveWrongByKind.shape, 0);
});

test("overdue echo stays almost; opening does not demote for lateness", () => {
  let s = passKinds(taught(), ["reading", "meaning", "shape"]);
  assert.equal(s.status, "almost");
  assert.ok(s.echoDueAt);
  const late = new Date(Date.parse(s.echoDueAt) + 40 * 3600 * 1000).toISOString();
  assert.equal(echoIsDue(s, late), true);
  assert.equal(echoIsStale(s, late, G1), true);
  assert.equal(echoAvailable(s, late, 0, G1), true);
  const opened = evaluateProgress(s, { type: "open", nowIso: late }, G1);
  assert.equal(opened.status, "almost");
  assert.equal(opened.echoSuccessCount, 0);
  assert.equal(opened.echoDueAt, s.echoDueAt);
});

test("wrong on an overdue echo still demotes to fix", () => {
  let s = passKinds(taught(), ["reading", "meaning", "shape"]);
  const late = new Date(Date.parse(s.echoDueAt ?? NOW) + 40 * 3600 * 1000).toISOString();
  s = evaluateProgress(
    s,
    {
      type: "answer",
      kind: "reading",
      correct: false,
      isEcho: true,
      echoBatchDone: true,
      nowIso: late,
      shapeAvailable: true,
      surfaceId: `${s.kanji}:solo`,
    },
    G1,
  );
  assert.equal(s.status, "fix");
  assert.equal(s.echoSuccessCount, 0);
});

test("P0-1 two instant client-echo submits cannot reach perfect", () => {
  let s = passKinds(taught(), ["reading", "meaning", "shape"]);
  const due = s.echoDueAt ?? NOW;
  s = echoOnce(s, due);
  assert.equal(s.status, "almost");
  assert.equal(s.echoSuccessCount, 1);
  s = echoOnce(s, due);
  assert.equal(s.status, "almost");
  assert.equal(s.echoSuccessCount, 1);
  assert.equal(s.perfectAt, null);
});

test("P0-1 clock fixture: first due echo stays almost; second after spacing is perfect", () => {
  let s = passKinds(taught(), ["reading", "meaning", "shape"]);
  s = echoOnce(s, s.echoDueAt ?? NOW);
  assert.equal(s.status, "almost");
  assert.equal(s.echoSuccessCount, 1);
  s = echoOnce(s, s.echoDueAt ?? NOW);
  assert.equal(s.status, "perfect");
  assert.equal(s.echoSuccessCount, 2);
});

test("P0-1 client isEcho/echoBatchDone ignored before due", () => {
  let s = passKinds(taught(), ["reading", "meaning", "shape"]);
  s = echoOnce(s, NOW);
  assert.equal(s.status, "almost");
  assert.equal(s.echoSuccessCount, 0);
});

test("P0-1 non-echo practice never grants perfect", () => {
  let s = passKinds(taught(), ["reading", "meaning", "shape"]);
  assert.equal(s.status, "almost");
  for (let i = 0; i < 4; i++) {
    s = passKinds(s, ["reading", "meaning", "shape"]);
  }
  assert.equal(s.status, "almost");
  assert.equal(s.echoSuccessCount, 0);
  assert.equal(s.perfectAt, null);
});

test("P0-1 server and demo derive echo from stored progress, ignore client flags", () => {
  const server = readFileSync("src/lib/server/progress.ts", "utf8");
  const demo = readFileSync("src/lib/demo-progress.ts", "utf8");
  const evalSrc = readFileSync("src/lib/progress-eval.ts", "utf8");
  const children = readFileSync("src/lib/server/children.ts", "utf8");
  assert.match(server, /scoringEcho = echoIsDue\(prev, now\)/);
  assert.match(demo, /scoringEcho = echoIsDue\(prev, now\)/);
  assert.equal(/isEcho:\s*data\.isEcho/.test(server), false);
  assert.equal(/echoBatchDone:\s*data\.echoBatchDone/.test(server), false);
  assert.equal(/isEcho:\s*input\.isEcho/.test(demo), false);
  assert.equal(/echoBatchDone:\s*input\.echoBatchDone/.test(demo), false);
  assert.equal(/event\.isEcho/.test(evalSrc), false);
  assert.equal(/event\.echoBatchDone/.test(evalSrc), false);
  assert.match(evalSrc, /const echoEligible = echoIsDue\(prev, nowIso\)/);
  assert.equal(/updateChildGrade/.test(children), false);
  const preview = readFileSync("src/lib/auth/preview.ts", "utf8");
  const authServer = readFileSync("src/lib/auth/server.ts", "utf8");
  assert.equal(/PREVIEW_CLIENT_SECRET\s*=/.test(preview), false);
  assert.equal(/[0-9a-f]{64}/.test(preview), false);
  assert.match(authServer, /GROK_PREVIEW_CLIENT_SECRET/);
});
