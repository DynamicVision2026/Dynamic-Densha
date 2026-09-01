import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { getGradeParams } from "../src/lib/grade-params.ts";
import {
  DECORATIVE_DEMO_CARS,
  isImportableGuestRow,
  parseGuestProgressMap,
  rebuildImportedProgress,
  toGuestPayload,
  type GuestProgressPayload,
} from "../src/lib/guest-import.ts";
import { emptyProgress, scheduleEchoFromNow } from "../src/lib/progress-eval.ts";

const NOW = "2026-09-01T03:00:00.000Z";
const PAST = "2026-08-01T00:00:00.000Z";
const G1 = getGradeParams(1);

function almostGuest(over: Partial<GuestProgressPayload> = {}): GuestProgressPayload {
  return {
    kanji: "右",
    status: "almost",
    lights: { reading: true, meaning: true, shape: true },
    encounterCompleted: true,
    understandCompleted: true,
    surfacesSeenSuccess: ["右:solo", "右:family"],
    repairRequiredKinds: [],
    wrongCountByKind: { reading: 0, meaning: 0, shape: 0 },
    consecutiveWrongByKind: { reading: 0, meaning: 0, shape: 0 },
    correctStreakByKind: { reading: 1, meaning: 1, shape: 1 },
    echoSuccessCount: 0,
    lastSuccessByKind: { meaning: "右:solo" },
    attempts: 4,
    ...over,
  };
}

test("almost guest with echoDueAt in the past → almost, echoDueAt > serverNow", () => {
  const guest = almostGuest();
  const { progress } = rebuildImportedProgress(guest, NOW, 1);
  assert.equal(progress.status, "almost");
  assert.ok(progress.echoDueAt);
  assert.ok(Date.parse(progress.echoDueAt) > Date.parse(NOW));
  const expected = scheduleEchoFromNow(NOW, G1, 0);
  assert.equal(progress.echoDueAt, expected.echoDueAt);
  assert.equal(progress.almostAt, NOW);
  assert.notEqual(progress.echoDueAt, PAST);
});

test("perfect + echoSuccessCount 2 → stays perfect", () => {
  const { progress, inspection } = rebuildImportedProgress(
    almostGuest({ kanji: "円", status: "perfect", echoSuccessCount: 2, surfacesSeenSuccess: ["円:solo"] }),
    NOW,
    1,
  );
  assert.equal(progress.status, "perfect");
  assert.equal(progress.perfectAt, NOW);
  assert.equal(progress.echoDueAt, null);
  assert.ok(inspection?.dueAt);
  assert.ok(Date.parse(inspection.dueAt) > Date.parse(NOW));
});

test("perfect + echoSuccessCount 0 or 1 → clamped to almost, new echoDueAt", () => {
  for (const n of [0, 1]) {
    const { progress } = rebuildImportedProgress(
      almostGuest({ kanji: "円", status: "perfect", echoSuccessCount: n }),
      NOW,
      1,
    );
    assert.equal(progress.status, "almost");
    assert.equal(progress.perfectAt, null);
    assert.ok(progress.echoDueAt);
    assert.ok(Date.parse(progress.echoDueAt) > Date.parse(NOW));
    assert.equal(progress.echoDueAt, scheduleEchoFromNow(NOW, G1, n).echoDueAt);
  }
});

test("PI-6: perfect claim with missing attestation evidence is demoted to almost", () => {
  const guest = almostGuest({ kanji: "円", status: "perfect", echoSuccessCount: 2 });
  const { progress, inspection } = rebuildImportedProgress(guest, NOW, 1, null);
  assert.equal(progress.status, "almost");
  assert.equal(progress.perfectAt, null);
  assert.equal(inspection, null);
  assert.ok(progress.echoDueAt);
  assert.equal(progress.echoDueAt, scheduleEchoFromNow(NOW, G1, 2).echoDueAt);
});

test("PI-6: perfect claim with too-short attested gap is demoted to almost", () => {
  const guest = almostGuest({ kanji: "円", status: "perfect", echoSuccessCount: 2 });
  const tooShortMs = G1.echo_second_delay_hours * 3600 * 1000 - 1;
  const { progress } = rebuildImportedProgress(guest, NOW, 1, tooShortMs);
  assert.equal(progress.status, "almost");
});

test("PI-6: perfect claim with a real attested gap stays perfect", () => {
  const guest = almostGuest({ kanji: "円", status: "perfect", echoSuccessCount: 2 });
  const realMs = G1.echo_second_delay_hours * 3600 * 1000;
  const { progress, inspection } = rebuildImportedProgress(guest, NOW, 1, realMs);
  assert.equal(progress.status, "perfect");
  assert.ok(inspection?.dueAt);
});

test("lights and surfacesSeenSuccess copied", () => {
  const guest = almostGuest({
    lights: { reading: true, meaning: false, shape: true },
    surfacesSeenSuccess: ["右:solo", "右:word"],
  });
  const { progress } = rebuildImportedProgress(guest, NOW, 1);
  assert.deepEqual(progress.lights, guest.lights);
  assert.deepEqual(progress.surfacesSeenSuccess, ["右:solo", "右:word"]);
});

test("U2 list matches imported surfacesSeenSuccess", () => {
  const guest = almostGuest({ surfacesSeenSuccess: ["右:solo", "右:family"] });
  const { progress } = rebuildImportedProgress(guest, NOW, 1);
  assert.deepEqual(progress.surfacesSeenSuccess, guest.surfacesSeenSuccess);
  const src = readFileSync("src/lib/guest-import.ts", "utf8");
  assert.equal(/evaluateProgress\s*\(/.test(src), false);
});

test("decorative door cars and attempts 0 are skipped", () => {
  assert.equal(isImportableGuestRow({ kanji: "音", attempts: 9 }), false);
  assert.equal(isImportableGuestRow({ kanji: "下", attempts: 1 }), false);
  assert.equal(isImportableGuestRow({ kanji: "火", attempts: 1 }), false);
  assert.equal(isImportableGuestRow({ kanji: "右", attempts: 0 }), false);
  assert.equal(isImportableGuestRow({ kanji: "右", attempts: 1 }), true);
  assert.ok(DECORATIVE_DEMO_CARS.has("音"));
  const parsed = parseGuestProgressMap({
    音: { ...emptyProgress("音"), status: "perfect", attempts: 3, echoSuccessCount: 2 },
    右: { ...emptyProgress("右"), status: "almost", attempts: 2, surfacesSeenSuccess: ["右:solo"] },
  });
  assert.equal(parsed.some((r) => r.kanji === "音"), false);
  assert.equal(parsed[0]?.kanji, "右");
  const payload = toGuestPayload({
    ...emptyProgress("円"),
    status: "fix",
    attempts: 2,
    echoDueAt: PAST,
  });
  assert.equal(payload.status, "fix");
});
