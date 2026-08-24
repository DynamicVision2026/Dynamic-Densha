/**
 * Batch 1 QA: per-grade surface packages + G1 full audit.
 *   node --experimental-strip-types scripts/surface-package-audit.ts
 */
import { writeFileSync } from "node:fs";
import { KYOIKU, trainsForGrade } from "../src/data/kyoiku.ts";
import {
  echoSurfacesFor,
  exampleWordSurfaces,
  hasEchoBundle,
  selectEchoSurface,
} from "../src/lib/echo-surfaces.ts";
import { isElementaryReading, elementaryReadingsOf } from "../src/lib/readings.ts";
import { isTeachReady, teachReadyChars } from "../src/lib/teach-ready.ts";

const MIN: Record<number, number> = { 1: 40, 2: 30, 3: 25, 4: 20, 5: 20, 6: 20 };

const illegal: string[] = [];
const g1rows: string[] = [
  "| 字 | 音 | 訓 | 詞面 | 同一読み≥2 | teach_ready | 備考 |",
  "|----|----|----|------|------------|-------------|------|",
];

for (const k of KYOIKU) {
  for (const s of echoSurfacesFor(k.char)) {
    if (s.id.endsWith(":solo")) continue;
    if (!isElementaryReading(k.char, s.reading)) {
      illegal.push(`${k.char} ${s.id} reading=${s.reading}`);
    }
  }
}

const packages: Record<number, { bundle: number; word: number; total: number; ready: number }> = {};
for (const g of [1, 2, 3, 4, 5, 6] as const) {
  const chars = KYOIKU.filter((k) => k.grade === g);
  const bundle = chars.filter((k) => hasEchoBundle(k.char)).length;
  const word = chars.filter((k) => exampleWordSurfaces(k.char).length > 0).length;
  packages[g] = { bundle, word, total: chars.length, ready: teachReadyChars(g).length };
}

for (const k of KYOIKU.filter((x) => x.grade === 1)) {
  const r = elementaryReadingsOf(k.char);
  const words = exampleWordSurfaces(k.char);
  const bundle = hasEchoBundle(k.char);
  let note = "";
  if (!bundle) note = "dual-再訪不可";
  const sample = words.map((s) => `${s.text}${s.frame ? "／" + s.frame : ""}(${s.reading})`).join(" · ");
  g1rows.push(
    `| ${k.char} | ${(r.onyomi || []).join(" ") || "—"} | ${(r.kunyomi || []).join(" ") || "—"} | ${sample || "—"} | ${bundle ? "yes" : "NO"} | ${isTeachReady(k.char) ? "yes" : "no"} | ${note} |`,
  );
}

const hayashi = selectEchoSurface({ char: "林", kind: "reading", lastSurfaceId: "林:林の中" });
const sei = selectEchoSurface({ char: "生", kind: "reading", lastSurfaceId: "生:生きる" });

const report = {
  illegalReadings: illegal,
  packages,
  mins: MIN,
  minsMet: Object.entries(MIN).every(([g, n]) => (packages[Number(g)]?.bundle ?? 0) >= n),
  g1TeachReady: packages[1]?.ready,
  g1Bundle: packages[1]?.bundle,
  sameWordNewFrameDemo: { from: "林:林の中", to: hayashi?.id, kind: hayashi?.kind, frame: hayashi?.frame },
  生From生きる: { to: sei?.id, text: sei?.text, reading: sei?.reading },
};

console.log(JSON.stringify(report, null, 2));
writeFileSync(new URL("../artifacts/g1-surface-audit.md", import.meta.url), g1rows.join("\n") + "\n");
if (illegal.length) process.exitCode = 1;
for (const [g, n] of Object.entries(MIN)) {
  if ((packages[Number(g)]?.bundle ?? 0) < n) process.exitCode = 1;
}
