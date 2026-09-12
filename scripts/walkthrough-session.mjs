/**
 * Get a browser walkthrough as far as a signed-in parent with one child.
 *
 * Every parent-surface walkthrough needs the same two things before it can
 * assert anything, and each one used to assume they were already true -- that
 * `/app` would land on `/onboard`, which only holds if some earlier run left a
 * session behind in that browser profile. Against a freshly started dev server
 * they all stopped at `/login` instead, which reads as a product failure and
 * is not one.
 *
 * The local dev database is in-memory and resets with the dev server, so a
 * fresh account per run is the honest default anyway: it means no check can
 * quietly depend on state a previous script wrote.
 */
export async function signInWithNewAccount(page, BASE, { childName = "たろう" } = {}) {
  await page.goto(`${BASE}/app`);
  await page.waitForLoadState("networkidle");

  if (page.url().includes("/login")) {
    await page.click("text=新規登録");
    await page.fill("#name", "テスト保護者");
    await page.fill("#email", `walkthrough-${Date.now()}@example.test`);
    await page.fill("#password", "walkthrough-pass");
    await page.click('form button[type="submit"]');
    await page.waitForFunction(() => !location.pathname.startsWith("/login"), { timeout: 30000 });
    await page.waitForLoadState("networkidle");
  }

  if (page.url().includes("/onboard")) {
    await page.fill("#child-name", childName);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/app\/child\//, { timeout: 20000 });
  }

  return new URL(page.url()).pathname.split("/")[3] ?? null;
}
