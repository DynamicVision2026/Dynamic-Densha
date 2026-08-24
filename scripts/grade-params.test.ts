import assert from "node:assert/strict";
import { test } from "node:test";
import { GRADE_PARAMS, getGradeParams } from "../src/lib/grade-params.ts";

const TABLE = {
  1: { max_new_per_day: 3, session_soft_minutes: 15, max_items_per_session: 3, lost_wrong_threshold: 3, lost_wrong_lifetime_threshold: 5, echo_delay_hours: 20, echo_per_day_cap: 2, echo_second_delay_hours: 168, perfect_echo_required: 2, perfect_decay_enabled: false, decay_days: 21, shape_mode: "scroll_whole", lights_ui: "stars", component_assemble_enabled: false, sentence_items_enabled: false },
  2: { max_new_per_day: 3, session_soft_minutes: 15, max_items_per_session: 3, lost_wrong_threshold: 3, lost_wrong_lifetime_threshold: 5, echo_delay_hours: 20, echo_per_day_cap: 2, echo_second_delay_hours: 168, perfect_echo_required: 2, perfect_decay_enabled: false, decay_days: 21, shape_mode: "scroll_whole", lights_ui: "stars", component_assemble_enabled: false, sentence_items_enabled: false },
  3: { max_new_per_day: 4, session_soft_minutes: 20, max_items_per_session: 4, lost_wrong_threshold: 3, lost_wrong_lifetime_threshold: 6, echo_delay_hours: 20, echo_per_day_cap: 3, echo_second_delay_hours: 168, perfect_echo_required: 2, perfect_decay_enabled: false, decay_days: 21, shape_mode: "components", lights_ui: "lights", component_assemble_enabled: true, sentence_items_enabled: false },
  4: { max_new_per_day: 4, session_soft_minutes: 20, max_items_per_session: 4, lost_wrong_threshold: 3, lost_wrong_lifetime_threshold: 6, echo_delay_hours: 36, echo_per_day_cap: 3, echo_second_delay_hours: 168, perfect_echo_required: 2, perfect_decay_enabled: false, decay_days: 21, shape_mode: "components", lights_ui: "lights", component_assemble_enabled: true, sentence_items_enabled: true },
  5: { max_new_per_day: 5, session_soft_minutes: 25, max_items_per_session: 4, lost_wrong_threshold: 4, lost_wrong_lifetime_threshold: 7, echo_delay_hours: 36, echo_per_day_cap: 5, echo_second_delay_hours: 168, perfect_echo_required: 2, perfect_decay_enabled: false, decay_days: 21, shape_mode: "confusable", lights_ui: "lights", component_assemble_enabled: false, sentence_items_enabled: true },
  6: { max_new_per_day: 5, session_soft_minutes: 25, max_items_per_session: 4, lost_wrong_threshold: 4, lost_wrong_lifetime_threshold: 7, echo_delay_hours: 36, echo_per_day_cap: 5, echo_second_delay_hours: 168, perfect_echo_required: 2, perfect_decay_enabled: false, decay_days: 21, shape_mode: "confusable", lights_ui: "lights", component_assemble_enabled: false, sentence_items_enabled: true },
} as const;

test("GRADE_PARAMS G1–G6 match Spec v0.2 table", () => {
  for (const grade of [1, 2, 3, 4, 5, 6] as const) {
    const row = GRADE_PARAMS[grade];
    const expect = TABLE[grade];
    for (const [key, value] of Object.entries(expect)) {
      assert.equal(row[key as keyof typeof row], value, `G${grade}.${key}`);
    }
    assert.equal(row.encounter_min_ms, 2000);
    assert.equal(row.understand_min_ms, 1000);
    assert.equal(row.max_items_per_kind_per_session, 1);
    assert.equal(row.reading_enabled, true);
    assert.equal(row.meaning_enabled, true);
    assert.equal(row.shape_enabled, true);
    assert.equal(row.force_reteach_on_wrong, true);
    assert.equal(row.echo_items_per_light, 1);
    assert.equal(row.subject_tag_line_enabled, true);
  }
});

test("runtime loads grade_params[child.grade]", () => {
  assert.equal(getGradeParams(1).grade, 1);
  assert.equal(getGradeParams(5).lost_wrong_threshold, 4);
  assert.equal(getGradeParams(99).grade, 1);
});

test("phonetic family off in G1–G2, on from G3; decay default off", () => {
  assert.equal(getGradeParams(1).phonetic_family_enabled, false);
  assert.equal(getGradeParams(2).phonetic_family_enabled, false);
  assert.equal(getGradeParams(3).phonetic_family_enabled, true);
  assert.equal(getGradeParams(1).perfect_decay_enabled, false);
  assert.equal(getGradeParams(6).perfect_decay_enabled, false);
  assert.equal(getGradeParams(1).perfect_decay_days, 21);
  assert.equal(getGradeParams(1).decay_days, 21);
});
