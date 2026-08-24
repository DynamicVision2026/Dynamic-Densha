import assert from "node:assert/strict";
import { test } from "node:test";
import { KYOIKU } from "../src/data/kyoiku.ts";
import { ENCOUNTER_MOTIF_W63 } from "../src/data/encounter-motifs-w63.ts";
import { MOTIF_ELEMENTS } from "../src/data/encounter-motif-drawings.ts";
import {
  encounterIllustration,
  getEncounter,
  hasEncounter,
  isMotifId,
} from "../src/lib/encounters.ts";
import { isTeachReady } from "../src/lib/teach-ready.ts";
import { shapeModeFor } from "../src/lib/kanji-structure.ts";

function customCount(grade: number): number {
  return KYOIKU.filter((k) => k.grade === grade).filter((k) => {
    const row = getEncounter(k.char);
    return row ? isMotifId(encounterIllustration(row)) : false;
  }).length;
}

test("W6.3 every override points at a drawn motif", () => {
  for (const [char, id] of Object.entries(ENCOUNTER_MOTIF_W63)) {
    assert.equal(isMotifId(id), true, char);
    const kind = id.slice("motif:".length);
    assert.ok(MOTIF_ELEMENTS[kind], `${char} missing drawing ${kind}`);
    assert.equal(hasEncounter(char), true, char);
  }
});

test("W6.3 G1 custom ≥56 (16+40); G2 high-frequency ≥40", () => {
  const g1 = customCount(1);
  const g2 = customCount(2);
  assert.ok(g1 >= 56, `G1 custom ${g1}`);
  assert.ok(g2 >= 40, `G2 custom ${g2}`);
});

test("W6.3 template still valid; leftover G2 stays template; 出会う never blocked", () => {
  const hiku = getEncounter("引")!;
  assert.equal(encounterIllustration(hiku), "template");
  assert.equal(hasEncounter("一"), true);
  assert.equal(hasEncounter("山"), true);
  assert.equal(isMotifId(encounterIllustration(getEncounter("山")!)), true);
  assert.equal(getEncounter("龍"), null);
});

test("W6.3 no mastery regression", () => {
  assert.equal(KYOIKU.filter((k) => isTeachReady(k.char)).length, 1026);
  assert.equal(shapeModeFor("山"), "stroke");
  assert.equal(shapeModeFor("林"), "component");
});
