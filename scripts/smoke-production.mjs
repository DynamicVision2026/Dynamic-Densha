#!/usr/bin/env node
/**
 * Post-domain-mapping smoke test: the routing contract and the landing
 * CTAs, checked against the real deployed hosts. Needs real outbound
 * internet access -- this sandbox's egress policy blocks arbitrary
 * internet hosts (confirmed via curl during this same launch pass), so
 * this script cannot be run from inside it. Run it from a machine with
 * real network access, or wire it into a CI job that has one.
 *
 * Checks:
 *   1. Routing contract -- app.kanji-ai.jp/, /parents, /app/parent all
 *      return 2xx (confirms the deployed build serves routes the repo's
 *      route tree defines, not a 404 from a stale/misconfigured revision).
 *   2. Apex + www -- kanji-ai.jp/ returns 2xx: www.kanji-ai.jp/ redirects
 *      to the apex (301/308) and the TLS handshake succeeds for both
 *      (fetch throws on a cert failure before a status code exists).
 *   3. Landing CTAs -- fetches the deployed index.html and asserts its two
 *      outbound links actually point at https://app.kanji-ai.jp/ and
 *      https://app.kanji-ai.jp/parents (or a relative /parents resolving
 *      there) -- stronger evidence than a manual click, since it reads the
 *      exact shipped href rather than trusting what render looks like.
 *
 * Exits non-zero (with every failure listed) if anything is wrong; does
 * not attempt sign-in, redeploy, screenshot parity, or a real-device
 * check -- those are inherently manual/human production tests, see
 * docs/commerce-launch-checklist.md.
 */

const APP_ORIGIN = "https://app.kanji-ai.jp";
const APEX_ORIGIN = "https://kanji-ai.jp";
const WWW_ORIGIN = "https://www.kanji-ai.jp";

const failures = [];

async function checkRoute(url, { expectRedirectTo } = {}) {
  let res;
  try {
    res = await fetch(url, { method: "GET", redirect: "manual" });
  } catch (err) {
    failures.push(`${url} -- request failed: ${err.message}`);
    return null;
  }
  if (expectRedirectTo) {
    if (res.status !== 301 && res.status !== 308) {
      failures.push(`${url} -- expected a 301/308 redirect, got ${res.status}`);
    } else {
      const location = res.headers.get("location") ?? "";
      if (!location.startsWith(expectRedirectTo)) {
        failures.push(`${url} -- redirects to "${location}", expected it to start with "${expectRedirectTo}"`);
      } else {
        console.log(`OK  ${url} -> ${res.status} -> ${location}`);
      }
    }
    return res;
  }
  if (res.status < 200 || res.status >= 300) {
    failures.push(`${url} -- expected 2xx, got ${res.status}`);
  } else {
    console.log(`OK  ${url} -> ${res.status}`);
  }
  return res;
}

await checkRoute(`${APP_ORIGIN}/`);
await checkRoute(`${APP_ORIGIN}/parents`);
await checkRoute(`${APP_ORIGIN}/app/parent`);
await checkRoute(`${APEX_ORIGIN}/`);
await checkRoute(`${WWW_ORIGIN}/`, { expectRedirectTo: APEX_ORIGIN });

const indexRes = await checkRoute(`${APEX_ORIGIN}/`);
if (indexRes) {
  const html = await indexRes.text().catch(() => "");
  const hasAppCta = /href=["']https:\/\/app\.kanji-ai\.jp\/["']/.test(html);
  const hasParentsCta =
    /href=["']https:\/\/app\.kanji-ai\.jp\/parents["']/.test(html) || /href=["']\/parents["']/.test(html);
  if (!hasAppCta) failures.push(`${APEX_ORIGIN}/ -- no href pointing at https://app.kanji-ai.jp/ found in the shipped HTML`);
  else console.log(`OK  ${APEX_ORIGIN}/ links to https://app.kanji-ai.jp/`);
  if (!hasParentsCta) failures.push(`${APEX_ORIGIN}/ -- no href pointing at /parents found in the shipped HTML`);
  else console.log(`OK  ${APEX_ORIGIN}/ links to /parents`);
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:`);
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log("\nAll production smoke checks passed.");
