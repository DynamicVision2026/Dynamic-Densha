import type { EchoSurface } from "@/lib/echo-surfaces";
import { ECHO_SURFACES_G1 } from "./echo-surfaces-g1.ts";
import { ECHO_SURFACES_G2G6 } from "./echo-surfaces-g2g6.ts";
import { ECHO_SURFACES_G2_REST } from "./echo-surfaces-g2-rest.ts";
import { ECHO_SURFACES_G3_REST } from "./echo-surfaces-g3-rest.ts";
import { ECHO_SURFACES_G4_REST } from "./echo-surfaces-g4-rest.ts";
import { ECHO_SURFACES_G5_REST } from "./echo-surfaces-g5-rest.ts";
import { ECHO_SURFACES_G6_REST } from "./echo-surfaces-g6-rest.ts";
import { ECHO_SURFACES_W61_G1 } from "./echo-surfaces-w61-g1.ts";
import { ECHO_SURFACES_W61_G2 } from "./echo-surfaces-w61-g2.ts";
import { ECHO_SURFACES_W61_G3G6 } from "./echo-surfaces-w61-g3g6.ts";

/** Editorial echo surfaces. `reading` must be in that kanji's elementary_readings. */
export type EchoSurfaceDraft = Omit<EchoSurface, "char" | "id" | "targetChar" | "creditsReading"> & {
  id?: string;
  char?: string;
  targetChar?: string;
  creditsReading?: boolean;
};

function mergeSurfaceTables(
  ...tables: Array<Record<string, EchoSurfaceDraft[]>>
): Record<string, EchoSurfaceDraft[]> {
  const out: Record<string, EchoSurfaceDraft[]> = {};
  for (const table of tables) {
    for (const [char, rows] of Object.entries(table)) {
      const stamped = rows.map((row) => ({
        ...row,
        targetChar: row.targetChar ?? char,
      }));
      out[char] = [...(out[char] ?? []), ...stamped];
    }
  }
  return out;
}

export const ECHO_SURFACE_TABLE: Record<string, EchoSurfaceDraft[]> = mergeSurfaceTables(
  ECHO_SURFACES_G1,
  ECHO_SURFACES_G2G6,
  ECHO_SURFACES_G2_REST,
  ECHO_SURFACES_G3_REST,
  ECHO_SURFACES_G4_REST,
  ECHO_SURFACES_G5_REST,
  ECHO_SURFACES_G6_REST,
  ECHO_SURFACES_W61_G1,
  ECHO_SURFACES_W61_G2,
  ECHO_SURFACES_W61_G3G6,
);
