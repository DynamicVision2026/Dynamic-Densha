# Commerce launch checklist

Everything the engineering side of the commerce module (Phase A, this repo +
`landingpage-densha`) needs is built and tested. What's left before a paid
plan can actually open is entirely outside the codebase — four items, each
with an owner, each with its own clock.

| # | Blocker | Owner | Notes |
|---|---|---|---|
| 1 | ~~Domain mapping~~ — `kanji-ai.jp` → the landing Cloud Run service, `app.kanji-ai.jp` → the app | Founder / infra | **Done** — both domains reported bound and DNS-resolved. Not independently verified from this environment: outbound HTTPS to arbitrary internet hosts is blocked by this sandbox's egress policy (confirmed again just now, `CONNECT tunnel failed, response 403` on both hosts) — this is the same sandbox-level restriction that blocked every reachability check earlier in this build, unrelated to whether the domains are actually live. Worth one real check from outside this environment before relying on it. |
| 2 | Legal review of `terms.html` / `privacy.html` | Founder + reviewer | Both files are marked "draft, needs legal review" in the landing repo's own README. Content is otherwise complete. |
| 3 | Business fields for `draft/pricing.html` and `draft/tokushoho.html` | Founder | Price (tax-included), payment method/timing, contract term & auto-renewal, cancellation method & deadline, refund policy. These are the only placeholders (`［…］`) left in either file — everything else (operator, representative, address, contact, phone-on-request) is already filled in and correct. |
| 4 | Shopify account + checkout link (now unblocked — domains are live, ready to test return URLs) | Founder | Configure the subscription product in the Shopify merchant backend, then drop the real checkout URL into `draft/pricing.html`'s one remaining `［Shopify チェックアウト URL］` placeholder. **Use a plain permalink or Payment Link URL, not a Buy Button embed** — a Buy Button is JavaScript, and the landing site must stay inert (`check-inert.mjs` fails on any `<script>`, including inside `draft/`). Shopify's return/redirect URL should point at `https://app.kanji-ai.jp/` (or a specific post-checkout route there, if one gets built) now that the app domain is live. Also verify Shopify's own final confirmation screen shows all six 特商法-required items (contract terms, renewal timing, price, cancellation method, cancellation deadline) — the default checkout doesn't necessarily satisfy this, and that screen is Shopify's, not ours. |

## Production verification, now that both domains are live

Five checks, cheapest to run now before real families exist. **None of these
are runnable from the environment that built this checklist** — outbound
HTTPS to arbitrary internet hosts is blocked by that sandbox's egress policy
(confirmed again during this pass: `gateway answered 403 to CONNECT`, same
block that stopped every reachability attempt throughout this build,
unrelated to whether the domains are actually live). Run them from a machine
with real network access.

1. **Routing contract + landing CTAs — automated.** `node
   scripts/smoke-production.mjs` checks `app.kanji-ai.jp/`, `/parents`,
   `/app/parent` all return 2xx; `kanji-ai.jp/` returns 2xx and
   `www.kanji-ai.jp/` 301/308s to the apex; and reads the deployed
   `index.html` to confirm its two CTA hrefs actually point at
   `https://app.kanji-ai.jp/` and `/parents` — stronger evidence than a
   manual click, since it checks the shipped href rather than trusting how
   the click behaved once.
2. **R1 — sign-in survives a redeploy.** Manual, can only be proven in
   production: sign in on `app.kanji-ai.jp`, trigger a redeploy of the app
   Cloud Run service (traffic-serving, not the `--no-traffic`-tagged preview
   workflow in this repo), reload, confirm the session is still valid. Do
   this before anyone has real progress to lose — session-cookie or
   auth-secret misconfiguration surviving a single deploy but not a second
   one is exactly the kind of bug that only shows up here.
3. **Parity capture at the deployed SHA** — guest and account home screens,
   one frame, both labelled. Couldn't locate a commit `42c4915` in this
   repo's history to confirm what "inherited through the entire
   remediation" refers to — if it's from a different repo or an artifact
   outside this checkout, point me at it and I'll fold it in; otherwise this
   is a fresh capture against the live site.
4. **One guest ride and one account ride on an actual phone**, Safari, with
   the toolbar showing. Requires a physical device — can't be simulated
   from here even with network access.
5. **Origin change, noted, no action taken.** A `*.run.app` preview origin's
   `localStorage` doesn't follow to `app.kanji-ai.jp` — fine now with no
   real families, since nothing of real value is stranded. **Do not move
   origins again after the first real signup** — from that point on, an
   origin change stops being a no-op and starts being real data loss for a
   real family.

## Sequencing the rest

- **Legal review (item 2) can start in parallel with everything else** — it
  has the longest external clock of the four remaining blockers.
- **Start the Shopify final-confirmation-screen check (item 4) early.** A
  default Shopify checkout doesn't necessarily show all six 特商法-required
  items — this is the item most likely to surprise you, so verify it with
  enough runway to reconfigure before that's a day-9 problem.

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
