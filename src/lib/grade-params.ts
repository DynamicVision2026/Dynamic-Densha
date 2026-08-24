import type { Grade } from "@/data/kyoiku";

export type ShapeMode = "scroll_whole" | "components" | "confusable";
export type LightsUi = "stars" | "lights";

export type GradeParams = {
  grade: Grade;
  max_new_per_day: number;
  session_soft_minutes: number;
  encounter_min_ms: number;
  understand_min_ms: number;
  max_items_per_session: number;
  max_items_per_kind_per_session: number;
  reading_enabled: boolean;
  meaning_enabled: boolean;
  shape_enabled: boolean;
  shape_mode: ShapeMode;
  sentence_items_enabled: boolean;
  component_assemble_enabled: boolean;
  lights_ui: LightsUi;
  force_reteach_on_wrong: boolean;
  lost_wrong_threshold: number;
  lost_wrong_lifetime_threshold: number;
  echo_delay_hours: number;
  echo_per_day_cap: number;
  echo_items_per_light: number;
  echo_second_delay_hours: number;
  perfect_echo_required: number;
  perfect_decay_enabled: boolean;
  decay_days: number;
  perfect_decay_days: number;
  subject_tag_line_enabled: boolean;
  phonetic_family_enabled: boolean;
};

const BASE: Omit<GradeParams, "grade"> = {
  max_new_per_day: 3,
  session_soft_minutes: 15,
  encounter_min_ms: 2000,
  understand_min_ms: 1000,
  max_items_per_session: 3,
  max_items_per_kind_per_session: 1,
  reading_enabled: true,
  meaning_enabled: true,
  shape_enabled: true,
  shape_mode: "scroll_whole",
  sentence_items_enabled: false,
  component_assemble_enabled: false,
  lights_ui: "stars",
  force_reteach_on_wrong: true,
  lost_wrong_threshold: 3,
  lost_wrong_lifetime_threshold: 5,
  echo_delay_hours: 20,
  echo_per_day_cap: 2,
  echo_items_per_light: 1,
  echo_second_delay_hours: 168,
  perfect_echo_required: 2,
  perfect_decay_enabled: false,
  decay_days: 21,
  perfect_decay_days: 21,
  subject_tag_line_enabled: true,
  phonetic_family_enabled: false,
};

export const GRADE_PARAMS: Record<Grade, GradeParams> = {
  1: { ...BASE, grade: 1 },
  2: { ...BASE, grade: 2 },
  3: {
    ...BASE,
    grade: 3,
    max_new_per_day: 4,
    session_soft_minutes: 20,
    max_items_per_session: 4,
    shape_mode: "components",
    component_assemble_enabled: true,
    lights_ui: "lights",
    lost_wrong_lifetime_threshold: 6,
    echo_per_day_cap: 3,
    phonetic_family_enabled: true,
  },
  4: {
    ...BASE,
    grade: 4,
    max_new_per_day: 4,
    session_soft_minutes: 20,
    max_items_per_session: 4,
    shape_mode: "components",
    component_assemble_enabled: true,
    sentence_items_enabled: true,
    lights_ui: "lights",
    lost_wrong_lifetime_threshold: 6,
    echo_delay_hours: 36,
    echo_per_day_cap: 3,
    phonetic_family_enabled: true,
  },
  5: {
    ...BASE,
    grade: 5,
    max_new_per_day: 5,
    session_soft_minutes: 25,
    max_items_per_session: 4,
    shape_mode: "confusable",
    sentence_items_enabled: true,
    lights_ui: "lights",
    lost_wrong_threshold: 4,
    lost_wrong_lifetime_threshold: 7,
    echo_delay_hours: 36,
    echo_per_day_cap: 5,
    phonetic_family_enabled: true,
  },
  6: {
    ...BASE,
    grade: 6,
    max_new_per_day: 5,
    session_soft_minutes: 25,
    max_items_per_session: 4,
    shape_mode: "confusable",
    sentence_items_enabled: true,
    lights_ui: "lights",
    lost_wrong_threshold: 4,
    lost_wrong_lifetime_threshold: 7,
    echo_delay_hours: 36,
    echo_per_day_cap: 5,
    phonetic_family_enabled: true,
  },
};

export function getGradeParams(grade: number): GradeParams {
  if (grade >= 1 && grade <= 6) return GRADE_PARAMS[grade as Grade];
  return GRADE_PARAMS[1];
}
