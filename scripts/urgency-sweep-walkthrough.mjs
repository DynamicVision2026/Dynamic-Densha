import { chromium, devices } from "playwright";
import { signInWithNewAccount } from "./walkthrough-session.mjs";

/**
 * The engineering ticket's own instruction: "Check by test, not by eye."
 * This drives 一 through to だいたい (reachedBlue -- the one 到着 situation
 * reachable live within a single session, twice over: once as the session's
 * first-almost SessionStub, once as the ordinary two-line station block on
 * a fresh mount of the same already-almost character) and greps the
 * RENDERED DOM of both, the child board, and the parent report for every
 * forbidden urgency pattern (§B.5's hard rules).
 *
 * stillBlue, reachedGreen-via-echo, repair and overdue all require either
 * real elapsed time (20h, then 168h, or ten real days) or a wrong answer
 * mid-practice that this walkthrough does not attempt to force reliably.
 * No server-side clock override exists for a live dev server outside the
 * isolated Node process test (Phase A's own boundary: nothing in a request
 * path may reach clock selection, and a live walkthrough is exactly a
 * request path). Those situations are proven instead by
 * scripts/station-state.test.ts (the message-table sweep, all 5 situations)
 * and scripts/echo-clock-sequence.test.ts (the real 20h/168h/perfect
 * sequence and the negative before-due case) -- deterministic, and the only
 * way to reach the 7-day and 10-day-overdue cases at all.
 */

const BASE = "http://localhost:8080";
const fails = [];
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"}  ${m}`); if (!c) fails.push(m); };

// 分/秒/時間 only count as violations paired with a digit (a duration, "20分"),
// not the character appearing inside an unrelated word -- 分母 (denominator),
// 自分 (oneself), 気分 (mood) etc. are ordinary vocabulary, not urgency.
// Likewise あと only counts as the ticket's own literal example, "あと◯時間"
// -- a countdown phrase -- not the unrelated word あとで ("later", the stub's
// own "claim later" button).
// 残り likewise only counts as the noun ("3 remaining"), not as part of the
// unrelated verb conjugations 残ります/残った ("[a stamp] remains").
const FORBIDDEN = /\d[\s\d]*(時間|分|秒)|あと\s*\d|まもなく|残り\s*\d|おくれ|%/;

function sweep(text, where) {
  const hit = FORBIDDEN.exec(text);
  ok(!hit, `${where}: no forbidden urgency pattern (found: ${hit ? JSON.stringify(hit[0]) : "none"})`);
}

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ ...devices["iPhone 13"] });
const page = await ctx.newPage();
page.on("dialog", (d) => d.accept());

const childId = await signInWithNewAccount(page, BASE, { childName: "たろう" });

// ── reachedBlue: teach 一, pass all three kinds, land on 到着 ────────────
// Same beat sequence scripts/qa-kd-walkthrough.mjs already drives for 王:
// ride-on -> (listen / scroll-place) -> わかった -> [choice-correct -> check
// -> next]* -> feedback. Generic over however many practice items a
// character needs, since that count isn't this ticket's concern.
async function clickIfPresent(locatorArg, opts = {}) {
  const loc = typeof locatorArg === "string" ? page.locator(locatorArg) : locatorArg;
  if (await loc.count()) {
    await loc.first().click(opts);
    return true;
  }
  return false;
}

// Teach 一 through all three kinds. The session's first だいたい shows a
// SessionStub ticket instead of the plain feedback block ("Stub only for
// first だいたい" per session-almost.ts's own comment) -- a different,
// already day-named UI, swept here too. Dismissing it and reloading the same
// character then mounts the component fresh with reachedAlmostThisSession
// no longer true, which is what actually shows this ticket's two-line
// station block for an already-almost character.
await page.goto(`${BASE}/app/child/${childId}/kanji/${encodeURIComponent("一")}`);
await page.waitForLoadState("networkidle");
await clickIfPresent('[data-tour="announce-dismiss"]');
await page.locator('[data-tour="ride-on"]').waitFor({ timeout: 15_000 });
await page.locator('[data-tour="ride-on"]').click();

await page.waitForTimeout(300);
await clickIfPresent(page.getByRole("button", { name: /よみを見る/ }));
await clickIfPresent(page.getByRole("button", { name: /を聞く/ }));
await clickIfPresent(page.locator("button").filter({ hasText: /かけじくに おく/ }));
await clickIfPresent(page.getByRole("button", { name: /わかった/ }));

for (let i = 0; i < 12; i++) {
  if (await page.$("[data-stub-claim], [data-stub-later]")) break;
  const choice = page.locator('[data-tour="choice-correct"]');
  if (await choice.count()) {
    await choice.first().click();
    await clickIfPresent('[data-tour="check"]');
    await page.waitForTimeout(250);
    await clickIfPresent('[data-tour="next"]');
    await page.waitForTimeout(250);
    continue;
  }
  // Stroke-assembly shape item (一 is one stroke): the stroke button's own
  // aria-label names the stroke ("1画目・よこ"), distinct from the mute
  // toggle ("おと を けす") that also carries an aria-label.
  const strokeBtn = page.locator('button[aria-label*="画目"]');
  if (await strokeBtn.count()) {
    await strokeBtn.first().click();
    await page.waitForTimeout(400);
    await clickIfPresent('[data-tour="next"]');
    await page.waitForTimeout(250);
    continue;
  }
  await clickIfPresent('[data-tour="next"]');
  await page.waitForTimeout(250);
}

if (await page.$("[data-stub-claim], [data-stub-later]")) {
  sweep((await page.textContent("body")) ?? "", "到着 (session stub, first だいたい)");
} else {
  ok(false, "could not reach the session stub for 一 within 12 loop steps -- selector drift, not this ticket's concern");
}
await clickIfPresent('[data-stub-later]');
await page.waitForTimeout(300);

// Fresh mount of the same, already-almost character: this is what actually
// shows the ordinary two-line block (reachedBlue) live.
await page.reload();
await page.waitForLoadState("networkidle");
const situation = await page.getAttribute("[data-station-state]", "data-station-state").catch(() => null);
if (situation) {
  const line1 = (await page.textContent("[data-station-line1]").catch(() => null)) ?? "";
  const line2 = (await page.textContent("[data-station-line2]").catch(() => "")) ?? "";
  ok(situation === "reachedBlue", `到着 shows reachedBlue for an already-almost character, not "${situation}"`);
  ok(/つぎは あした|つぎは あさって|つぎは \d+日後/.test(line2), `line2 names a real day: "${line2}"`);
  sweep(line1 + " " + line2, `到着 (${situation})`);
  const body = (await page.textContent("body")) ?? "";
  sweep(body, "到着 (full body)");
} else {
  ok(false, "could not find the station block after reload -- selector drift, not this ticket's concern");
  sweep((await page.textContent("body")) ?? "", "到着 (whatever rendered)");
}

// ── the child's own board ────────────────────────────────────────────────
await page.goto(`${BASE}/app/child/${childId}`);
await page.waitForLoadState("networkidle");
sweep((await page.textContent("body")) ?? "", "child board");

// ── the parent report ────────────────────────────────────────────────────
await page.goto(`${BASE}/app/parent/report/${childId}`);
await page.waitForLoadState("networkidle");
const reportBody = (await page.textContent("body")) ?? "";
sweep(reportBody, "parent report");
// Whether anything is due tomorrow depends on the real wall-clock time this
// runs at (20h from "now" may or may not cross into the Tokyo calendar's
// tomorrow) -- so this only checks the line is well-formed when present,
// never asserts it one way or the other. The zero/non-zero logic itself is
// pinned deterministically in scripts/station-state.test.ts.
const arrivalLine = page.locator("[data-parent-arrival-tomorrow]");
if (await arrivalLine.count()) {
  const text = (await arrivalLine.textContent()) ?? "";
  ok(/^あした、\d+両が とうちゃくします。$/.test(text.trim()), `arrivingTomorrow line is well-formed: "${text.trim()}"`);
} else {
  ok(true, "no arrivingTomorrow line (nothing due tomorrow at this wall-clock moment)");
}

await b.close();
console.log(fails.length ? `\n${fails.length} FAILED` : "\nno forbidden urgency pattern anywhere the sweep could reach live");
process.exit(fails.length ? 1 : 0);
