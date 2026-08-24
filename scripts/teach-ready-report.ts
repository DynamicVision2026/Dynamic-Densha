/** Content log: which checklist items fail per kyōiku character. */
import { KYOIKU } from "../src/data/kyoiku.ts";
import { teachReadyReport } from "../src/lib/teach-ready.ts";

const byGrade: Record<number, { ready: number; total: number; fails: string[] }> = {};
for (const k of KYOIKU) {
  const row = teachReadyReport(k.char);
  const g = (byGrade[k.grade] ??= { ready: 0, total: 0, fails: [] });
  g.total += 1;
  if (row.teach_ready) g.ready += 1;
  else if (g.fails.length < 12) g.fails.push(`${k.char}:${row.fails.join("+")}`);
}

console.log(JSON.stringify({ grades: byGrade }, null, 2));
