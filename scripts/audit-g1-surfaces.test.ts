import assert from "node:assert/strict";
import { test } from "node:test";
import { echoSurfacesFor } from "../src/lib/echo-surfaces.ts";
import { isElementaryReading } from "../src/lib/readings.ts";
import { teachReadyChars } from "../src/lib/teach-ready.ts";

function legalSurfaceCount(char: string): number {
  const ids = new Set<string>();
  for (const s of echoSurfacesFor(char)) {
    if (!isElementaryReading(char, s.reading)) continue;
    ids.add(s.id);
  }
  return ids.size;
}

test("G1 teach_ready surface histogram (soft variety, hard-fail only on 0)", () => {
  const chars = teachReadyChars(1);
  assert.equal(chars.length, 80, `expected 80 G1 teach_ready, got ${chars.length}`);

  const buckets: Record<string, string[]> = { ">=3": [], "2": [], "1": [], "0": [] };
  for (const char of chars) {
    const n = legalSurfaceCount(char);
    if (n >= 3) buckets[">=3"]!.push(char);
    else if (n === 2) buckets["2"]!.push(char);
    else if (n === 1) buckets["1"]!.push(char);
    else buckets["0"]!.push(char);
  }

  console.log("G1 legal surfaces (echoSurfacesFor ∩ elementary, unique id):");
  console.log(`  chars with >= 3: ${buckets[">=3"]!.length}  ${buckets[">=3"]!.join("")}`);
  console.log(`  chars with 2:    ${buckets["2"]!.length}  ${buckets["2"]!.join("")}`);
  console.log(`  chars with 1:    ${buckets["1"]!.length}  ${buckets["1"]!.join("")}`);
  console.log(`  chars with 0:    ${buckets["0"]!.length}  ${buckets["0"]!.join("")}`);

  assert.equal(buckets["0"]!.length, 0, `G1 chars with 0 legal surfaces: ${buckets["0"]!.join(" ")}`);
});
