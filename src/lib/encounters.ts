/**
 * Encounter (出会う) content. Static ink-wash + short copy.
 * Never scores. Never calls evaluateProgress.
 */
import { ENCOUNTERS_G1, type EncounterRow } from "../data/encounters-g1.ts";
import { ENCOUNTERS_G2G6 } from "../data/encounters-g2g6.ts";
import { ENCOUNTERS_G2_REST } from "../data/encounters-g2-rest.ts";
import { ENCOUNTERS_G3_REST } from "../data/encounters-g3-rest.ts";
import { ENCOUNTERS_G4_REST } from "../data/encounters-g4-rest.ts";
import { ENCOUNTERS_G5_REST } from "../data/encounters-g5-rest.ts";
import { ENCOUNTERS_G6_REST } from "../data/encounters-g6-rest.ts";
import { ENCOUNTER_MOTIF_W63 } from "../data/encounter-motifs-w63.ts";

export type Encounter = EncounterRow;

const TABLE: Record<string, EncounterRow> = Object.fromEntries(
  [
    ...ENCOUNTERS_G1,
    ...ENCOUNTERS_G2G6,
    ...ENCOUNTERS_G2_REST,
    ...ENCOUNTERS_G3_REST,
    ...ENCOUNTERS_G4_REST,
    ...ENCOUNTERS_G5_REST,
    ...ENCOUNTERS_G6_REST,
  ].map((row) => [row.char, row]),
);

export const TEMPLATE_ILLUSTRATION = "template";

export function getEncounter(char: string): Encounter | null {
  return TABLE[char] ?? null;
}

export function encounterLines(body: string): string[] {
  return body
    .split(/\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function hasEncounter(char: string): boolean {
  const row = getEncounter(char);
  if (!row) return false;
  if (encounterLines(row.body_ja).length < 2) return false;
  return Boolean(row.illustration);
}

/** Missing custom art → template id; beat still unblocks. W6.3 motif override wins. */
export function encounterIllustration(row: Encounter): string {
  const override = ENCOUNTER_MOTIF_W63[row.char];
  if (override) return override;
  return row.illustration?.trim() || TEMPLATE_ILLUSTRATION;
}

export function isMotifId(id: string): boolean {
  return id.startsWith("motif:");
}
