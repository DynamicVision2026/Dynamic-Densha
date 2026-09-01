import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ARRIVAL_AUDIO_MAX_MS, shouldPlayArrivalSounds } from "../src/lib/arrival-audio.ts";
import {
  newPerfectGlyphs,
  planReturnMoment,
  RETURN_GLOW_MS,
} from "../src/lib/consist-seen.ts";

test("S1: mute flag skips both sounds; duration cap documented", () => {
  assert.equal(shouldPlayArrivalSounds({ muted: true, reducedMotion: false }), false);
  assert.equal(shouldPlayArrivalSounds({ muted: false, reducedMotion: false }), true);
  assert.ok(ARRIVAL_AUDIO_MAX_MS < 2000);
  assert.ok(ARRIVAL_AUDIO_MAX_MS > 0);
});

test("S2: same snapshot → no glow class; new glyph → glow then snapshot equals consist", () => {
  assert.deepEqual(newPerfectGlyphs(["一", "右"], ["一", "右"]), []);
  const same = planReturnMoment({
    consist: ["右", "一"],
    snapshot: ["一", "右"],
    reducedMotion: false,
  });
  assert.deepEqual(same.glow, []);
  assert.equal(same.holdMs, 0);

  const consist = ["右", "花"];
  const fresh = planReturnMoment({
    consist,
    snapshot: ["右"],
    reducedMotion: false,
  });
  assert.deepEqual(fresh.glow, ["花"]);
  assert.equal(fresh.holdMs, RETURN_GLOW_MS);
  assert.deepEqual(fresh.nextSnapshot, ["右", "花"]);
});

test("reduced-motion: skip glow, skip extra hold, sounds off", () => {
  assert.equal(shouldPlayArrivalSounds({ muted: false, reducedMotion: true }), false);
  const plan = planReturnMoment({
    consist: ["花"],
    snapshot: ["右"],
    reducedMotion: true,
  });
  assert.deepEqual(plan.glow, []);
  assert.equal(plan.holdMs, 0);
  assert.deepEqual(plan.nextSnapshot, ["花"]);
});

test("S2 first install empty snapshot is no change", () => {
  const plan = planReturnMoment({
    consist: ["右", "一"],
    snapshot: null,
    reducedMotion: false,
  });
  assert.deepEqual(plan.glow, []);
  assert.equal(plan.holdMs, 0);
});

test("ChildHome has no count-up copy", () => {
  const src = readFileSync("src/components/child-home.tsx", "utf8");
  assert.equal(/ふえた|red.?dot|badge/.test(src), false);
  assert.match(src, /skipReturnGlow/);
  assert.match(src, /glowChars=\{returnGlow\}/);
});

test("到着 audio is one beat, CTAs not gated on sound", () => {
  const session = readFileSync("src/components/kanji-session.tsx", "utf8");
  assert.match(session, /playArrivalBeat/);
  assert.match(session, /arrivalAudioPlayed/);
  assert.equal(/await playArrivalBeat/.test(session), false);
});
