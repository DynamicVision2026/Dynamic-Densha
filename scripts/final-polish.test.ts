import assert from "node:assert/strict";
import { test } from "node:test";
import { KYOIKU } from "../src/data/kyoiku.ts";
import { GRADE_PARAMS } from "../src/lib/grade-params.ts";
import {
  encounterIllustration,
  getEncounter,
  hasEncounter,
  isMotifId,
} from "../src/lib/encounters.ts";
import { MOTIF_ELEMENTS } from "../src/data/encounter-motif-drawings.ts";
import { ENCOUNTER_MOTIF_W63 } from "../src/data/encounter-motifs-w63.ts";
import { isTeachReady } from "../src/lib/teach-ready.ts";
import { buildParentReport } from "../src/lib/parent-report.ts";
import { emptyProgress } from "../src/lib/progress-eval.ts";
import { MESSAGES } from "../src/lib/i18n/messages.ts";

test("second 再訪 delay is ~168h on every grade; first delay stays 20/36", () => {
  for (const g of [1, 2, 3, 4, 5, 6] as const) {
    assert.equal(GRADE_PARAMS[g].echo_second_delay_hours, 168, `G${g} second`);
    assert.equal(GRADE_PARAMS[g].perfect_echo_required, 2);
  }
  assert.equal(GRADE_PARAMS[1].echo_delay_hours, 20);
  assert.equal(GRADE_PARAMS[2].echo_delay_hours, 20);
  assert.equal(GRADE_PARAMS[3].echo_delay_hours, 20);
  assert.equal(GRADE_PARAMS[4].echo_delay_hours, 36);
});

test("G1 encounter custom motifs reach 80/80", () => {
  const g1 = KYOIKU.filter((k) => k.grade === 1);
  let custom = 0;
  for (const k of g1) {
    const row = getEncounter(k.char)!;
    assert.equal(hasEncounter(k.char), true, k.char);
    const id = encounterIllustration(row);
    if (isMotifId(id)) {
      custom += 1;
      const kind = id.slice("motif:".length);
      assert.ok(MOTIF_ELEMENTS[kind], `${k.char} ${kind}`);
    }
  }
  assert.equal(custom, 80);
  assert.ok(ENCOUNTER_MOTIF_W63["一"]);
});

test("parent JA/EN critical copy is present", () => {
  for (const bag of [MESSAGES.ja, MESSAGES.en]) {
    assert.ok(bag.parentRolesApp.length > 10);
    assert.ok(bag.parentRolesPaper.length > 10);
    assert.ok(bag.parentPaperLead.includes("5") || bag.parentPaperLead.toLowerCase().includes("five"));
    assert.ok(bag.parentTeachReadyNote.includes("1026") || bag.parentTeachReadyNote.includes("1,026"));
    assert.ok(bag.shapeLicense.toLowerCase().includes("kanjivg"));
    assert.ok(bag.audioLicense.length > 10);
    assert.ok(bag.parentAttentionWaiting.length > 4);
  }
  assert.match(MESSAGES.ja.parentRolesApp, /選択式/);
  assert.match(MESSAGES.en.parentRolesApp, /multiple choice/i);
});

test("parent attention waiting_second + teach_ready denominator honest", () => {
  const report = buildParentReport({
    grade: 1,
    progress: {
      右: { ...emptyProgress("右"), status: "almost", echoSuccessCount: 1, almostAt: "2026-08-01T00:00:00.000Z" },
    },
    events: [],
    stamps: [],
  });
  assert.equal(report.attention.find((a) => a.kanji === "右")?.reason, "waiting_second");
  assert.ok(report.teachReadyTotal <= 80);
  assert.notEqual(report.teachReadyTotal, 1026);
  assert.equal(KYOIKU.filter((k) => isTeachReady(k.char)).length, 1026);
});
