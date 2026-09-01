import assert from "node:assert/strict";
import { test } from "node:test";
import { ECHO_SURFACE_TABLE } from "../src/data/echo-surfaces.ts";
import { echoSurfacesFor, surfaceIdentity } from "../src/lib/echo-surfaces.ts";

function usedForReadOrMeaning(row: { used_for_lights?: Array<"reading" | "meaning"> }) {
  const used = row.used_for_lights;
  if (!used || used.length === 0) return true;
  return used.includes("reading") || used.includes("meaning");
}

test("published word surfaces set targetChar explicitly; solo may default to char", () => {
  const missing: string[] = [];
  for (const [char, rows] of Object.entries(ECHO_SURFACE_TABLE)) {
    for (const row of rows) {
      if (!usedForReadOrMeaning(row)) continue;
      const id = row.id ?? surfaceIdentity({ char, text: row.text, frame: row.frame });
      if (id === `${char}:solo`) {
        assert.equal(row.targetChar ?? char, char, id);
        continue;
      }
      if (!row.targetChar) missing.push(`${char} ${id}`);
    }
  }
  assert.equal(missing.length, 0, `word surfaces missing targetChar: ${missing.slice(0, 12).join(", ")}`);

  const hana = echoSurfacesFor("花").find((s) => s.text === "花火");
  assert.ok(hana);
  assert.equal(hana.targetChar, "花");
  const solo = echoSurfacesFor("花").find((s) => s.id === "花:solo");
  assert.equal(solo?.targetChar, "花");
});
