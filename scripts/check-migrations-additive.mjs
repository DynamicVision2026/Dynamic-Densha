#!/usr/bin/env node
/**
 * Deploy-safety gate: migrations must be additive.
 *
 * The production pipeline (.github/workflows/deploy-production.yml) applies
 * pending migrations to Neon BEFORE the new revision takes traffic, while the
 * previous revision is still serving. That is only safe if the old code keeps
 * working against the new schema -- which holds for additive changes (new
 * tables, new nullable columns, new indexes, backfills) and breaks the moment
 * a migration drops or reshapes something the running revision still reads.
 *
 * Fails if any migrations/*.sql contains a schema-destructive statement:
 *   drop table/column/index/constraint, truncate, alter column (type / not
 *   null on existing rows), rename, delete from.
 *
 * A genuinely necessary destructive migration opts out with a marker line
 * carrying its reason, e.g.
 *   -- allow-destructive: column x unused since 0012, all revisions migrated
 * which makes the exception visible in review instead of silent. Prefer the
 * expand/contract pattern: add the new shape now, drop the old one only in a
 * later migration once no serving revision references it.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const DIR = join(ROOT, "migrations");
const ALLOW_MARKER = /^\s*--\s*allow-destructive:\s*\S/m;

const DESTRUCTIVE = [
  [/\bdrop\s+(table|column|index|constraint)\b/i, "drop"],
  [/\btruncate\b/i, "truncate"],
  [/\balter\s+column\b/i, "alter column"],
  [/\brename\s+(to|column)\b/i, "rename"],
  [/\bdelete\s+from\b/i, "delete from"],
];

function stripSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
const errors = [];
const exempt = [];

for (const file of files) {
  const raw = readFileSync(join(DIR, file), "utf8");
  if (ALLOW_MARKER.test(raw)) {
    exempt.push(file);
    continue;
  }
  const lines = stripSqlComments(raw).split("\n");
  lines.forEach((line, i) => {
    for (const [re, label] of DESTRUCTIVE) {
      if (re.test(line)) errors.push(`${file}:${i + 1}  [${label}]  ${line.trim().slice(0, 100)}`);
    }
  });
}

if (errors.length) {
  console.error("additive-migrations failed -- a destructive statement would break the still-serving revision during deploy:");
  for (const e of errors) console.error(" -", e);
  console.error("\nUse expand/contract, or add a `-- allow-destructive: <reason>` line if this is genuinely safe.");
  process.exit(1);
}
console.log(
  `additive-migrations ok (${files.length} file(s)${exempt.length ? `, ${exempt.length} explicitly exempted: ${exempt.join(", ")}` : ""})`,
);
