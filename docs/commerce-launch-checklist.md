# Commerce launch checklist

Everything the engineering side of the commerce module (Phase A, this repo +
`landingpage-densha`) needs is built and tested. What's left before a paid
plan can actually open is entirely outside the codebase — four items, each
with an owner, each with its own clock.

| # | Blocker | Owner | Notes |
|---|---|---|---|
| 1 | Domain mapping — `kanji-ai.jp` → the landing Cloud Run service, `app.kanji-ai.jp` → the app | Founder / infra | DNS + certificate issuance are the steps with the longest, least controllable clock. Start first. |
| 2 | Legal review of `terms.html` / `privacy.html` | Founder + reviewer | Both files are marked "draft, needs legal review" in the landing repo's own README. Content is otherwise complete. |
| 3 | Business fields for `draft/pricing.html` and `draft/tokushoho.html` | Founder | Price (tax-included), payment method/timing, contract term & auto-renewal, cancellation method & deadline, refund policy. These are the only placeholders (`［…］`) left in either file — everything else (operator, representative, address, contact, phone-on-request) is already filled in and correct. |
| 4 | Shopify account + checkout link | Founder | Configure the subscription product in the Shopify merchant backend, then drop the real checkout URL into `draft/pricing.html`'s one remaining `［Shopify チェックアウト URL］` placeholder. **Use a plain permalink or Payment Link URL, not a Buy Button embed** — a Buy Button is JavaScript, and the landing site must stay inert (`check-inert.mjs` fails on any `<script>`, including inside `draft/`). Also verify Shopify's own final confirmation screen shows all six 特商法-required items (contract terms, renewal timing, price, cancellation method, cancellation deadline) — the default checkout doesn't necessarily satisfy this, and that screen is Shopify's, not ours. |

## Expected, not a regression: the placeholder gate goes red at promotion

`check-placeholders.mjs` currently exempts `draft/` on purpose — the two
files above are meant to carry `［…］` placeholders until item 3 is resolved.
When they move from `draft/` to the site root for launch (uncommenting the
特商法 link in `index.html`'s footer at the same time), the gate starts
applying to them for the first time and **will fail** until every bracket is
filled. That is the gate doing its job, not a build regression introduced by
moving the files — expect it, and don't stop the launch to investigate it as
a bug.

## Day-8 safety valve (first cohort only)

If Shopify checkout isn't fully verified by day 8 of the first cohort, extend
trials by 14 days rather than rushing an untested checkout live — this was
the pre-authorized fallback (spec §8, `admin_action`), but until now there
was no way to actually pull that lever short of hand-writing SQL against
production. `scripts/extend-trial.mjs` is that lever:

```bash
DATABASE_URL=<production Neon URL> node scripts/extend-trial.mjs \
  --household hh_xxxxxxxx --days 14 --reason "checkout not verified by day 8" --actor "founder"
```

It inserts one row into the append-only `admin_action` table and nothing
else — `recomputeSubscription` folds that in fresh on every real read
(home load, parent dashboard), so the extension takes effect the next time
that household opens the app, no restart or redeploy involved. It refuses
to run without `DATABASE_URL` set, so it can't silently target the local
PGLite dev fallback and look like it worked. One household at a time by
design — a first cohort is small enough that this is a feature, not friction.

## What's already done

- Household/subscription/entitlement model, trial clock, webhook signature
  verification + idempotent apply, server-side `canRide` enforcement across
  every ride entry point (not just the final answer write), and the
  lapsed-child disabled boarding pass — all tested, all in `Dynamic-Densha`.
- Trial-abuse guard (`trial_spent`): one trial per email, survives account
  deletion (no foreign key to household/user), verified against a standalone
  PGLite instance mirroring the real schema.
- Parent-facing trial status: the trial end date is visible from a
  household's first dashboard visit onward (not just near the end), and a
  household whose trial is already spent sees a clear message with a
  subscribe link instead of a silent dead end.
- A5 (parent trial notices): no email infrastructure exists in this repo and
  none is being built pre-launch — the parent-dashboard banner above is the
  agreed substitute. Revisit real email once the domain (item 1) is settled.
- `draft/pricing.html` / `draft/tokushoho.html`: operator, representative,
  address, contact email, and phone-disclosure-on-request are filled in and
  correct. Price, payment terms, cancellation, and the checkout link are
  intentionally still bracketed pending items 3 and 4 above.
