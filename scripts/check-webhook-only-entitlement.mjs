#!/usr/bin/env node
/**
 * Commerce spec §6.2/§13 rule 3: entitlement is granted by webhook, never
 * by the return URL. A return URL is a claim made by a browser and can be
 * forged by anyone who reads it once.
 *
 * applyShopifyWebhook() (src/lib/server/webhooks.ts) is the only function
 * that ever inserts a billing_event row, which is the only path by which
 * subscription-derive.ts's fold can transition a household to 'active'.
 * Fail if any route file imports it, or otherwise writes to billing_event
 * directly -- a Shopify return-URL page must redirect the parent back to
 * the parent surface and nothing else; it must never itself grant
 * entitlement.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const ROUTES_DIR = join(ROOT, "src/routes");
const BAD = /applyShopifyWebhook|insert\s+into\s+billing_event/i;

function walk(dir, acc = []) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name === ".git") continue;
      walk(p, acc);
    } else if (/\.(ts|tsx)$/.test(ent.name)) acc.push(p);
  }
  return acc;
}

const errors = [];
for (const file of walk(ROUTES_DIR)) {
  const rel = relative(ROOT, file);
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    if (BAD.test(line)) errors.push(`${rel}:${i + 1}  ${line.trim().slice(0, 110)}`);
  });
}

if (errors.length) {
  console.error("webhook-only-entitlement failed -- a route handler can grant entitlement directly:");
  for (const e of errors) console.error(" -", e);
  process.exit(1);
}
console.log("webhook-only-entitlement ok");
