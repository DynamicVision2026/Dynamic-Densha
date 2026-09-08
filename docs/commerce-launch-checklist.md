# Commerce launch checklist

Everything the engineering side of the commerce module (Phase A, this repo +
`landingpage-densha`) needs is built and tested. What's left before a paid
plan can actually open is entirely outside the codebase — four items, each
with an owner, each with its own clock.

| # | Blocker | Owner | Notes |
|---|---|---|---|
| 1 | ~~Domain mapping~~ — `kanji-ai.jp` → the landing Cloud Run service, `app.kanji-ai.jp` → the app | Founder / infra | **Done** — both domains reported bound and DNS-resolved. Not independently verified from this environment: outbound HTTPS to arbitrary internet hosts is blocked by this sandbox's egress policy (confirmed again just now, `CONNECT tunnel failed, response 403` on both hosts) — this is the same sandbox-level restriction that blocked every reachability check earlier in this build, unrelated to whether the domains are actually live. Worth one real check from outside this environment before relying on it. |
| 2 | Legal review of `terms.html` / `privacy.html` | Founder + reviewer | Content is complete (10-day trial, monthly/yearly pricing, cancellation/refund and read-only-after-lapse terms all filled in) but has not been independently confirmed as legally reviewed from this environment. |
| 3 | ~~Business fields for `pricing.html` and `tokushoho.html`~~ | Founder | **Done.** Both files are live at the site root (`landingpage-densha`, no longer in `draft/`): 月額プラン ¥1,280/月, 年額プラン ¥10,800/年, payment method/timing, contract term & auto-renewal, cancellation method & deadline, and refund policy are all filled in — no `［…］` placeholders remain. |
| 4 | ~~Stripe account + checkout links~~ (superseded Shopify — the account was never opened, no code shipped against it) | Founder | **Mostly done, architecture changed since the table below was last written — see "Unified funnel" section.** `pricing.html`'s buttons currently still link straight to the two live Stripe Payment Links (monthly ¥1,280, yearly ¥10,800); those are being replaced with links to `app.kanji-ai.jp/subscribe?plan=…` (`src/routes/subscribe.ts`, this repo), which attaches the household's `checkout_token` server-side instead of the landing page having to know it. The webhook endpoint (`src/routes/api/webhooks/stripe.ts`) is unchanged: it ingests `checkout.session.completed`, `invoice.payment_succeeded`/`failed`, `customer.subscription.deleted`/`updated`, and `charge.refunded`, verified via Stripe's own signature scheme. Plan (monthly/yearly) is resolved by matching the purchased subscription's Stripe **Price id** against `STRIPE_PRICE_MONTHLY_ID`/`STRIPE_PRICE_ANNUAL_ID`, not by amount — a price change in the Stripe Dashboard alone can never silently break entitlement or mislabel a plan (`src/lib/stripe-plan.ts`; an unmatched price id is logged and left unset, never guessed). **Still needed, and not done from this environment:** configure `STRIPE_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_PRICE_MONTHLY_ID`, and `STRIPE_PRICE_ANNUAL_ID` as real env vars on the deployed Cloud Run service (see "One-time setup" below — these are Cloud Run service config, not GitHub Actions secrets, since nothing in the deploy workflow injects Cloud Run env vars today), register the webhook endpoint's URL in the Stripe Dashboard, run both verification passes described there, and — last, once the resolver below is deployed and verified — update `landingpage-densha`'s CTAs to the four hrefs in the "Unified funnel" section. Also verify Stripe Checkout's own final confirmation screen shows all six 特商法-required items (contract terms, renewal timing, price, cancellation method, cancellation deadline) — the default screen doesn't necessarily satisfy this, and that screen is Stripe's, not ours. |

## Unified funnel — landing page to checkout

`kanji-ai.jp` stays static/inert (no session, no cookies, no auth-aware
content — `check-inert.mjs` in `landingpage-densha` still enforces this) and
never links straight to `buy.stripe.com`. Instead every "subscribe" CTA
points at `app.kanji-ai.jp/subscribe?plan=monthly|annual` — a thin,
server-side-only resolver (`src/routes/subscribe.ts`) that renders nothing
and holds no state; its entire job is resolve household → build URL → 302.
Identity never crosses the origin boundary; a plan name does.

```
kanji-ai.jp  (static, inert)
      │  <a href="https://app.kanji-ai.jp/subscribe?plan=monthly">
      ▼
app.kanji-ai.jp/subscribe
      ├─ plan missing/invalid → /app/parent
      ├─ no session           → /login?next=<encoded self>
      ├─ session, no household → resolveHouseholdId creates one (idempotent)
      ├─ household already 'active' → /app/parent?already=active (never double-charge)
      └─ otherwise            → mint/read checkout_token, 302 to Stripe
                                 with ?client_reference_id=<token>
                                        │
                                        ▼
                          Stripe checkout → webhook grants entitlement
                          → return_url → /app/parent?checkout=pending
```

The branch decision is pure and unit-tested independently of any DB/session
call (`src/lib/subscribe-resolve.ts`, `scripts/subscribe-resolve.test.ts`) —
the route itself only supplies the already-resolved `hasSession`/`isActive`
inputs each branch needs. `isHouseholdActive()`
(`src/lib/server/subscription.ts`) is the one place that distinguishes
"trialing" from "actually paying," used by both this resolver (to avoid a
double charge) and the pending-checkout poll below (to know when a webhook
has actually landed) — `scripts/check-single-entitlement.mjs` still forbids
a literal `state === 'active'` comparison anywhere else.

**`next` carry-through + allow-list.** A signed-out visitor hitting
`/subscribe` is sent to `/login?next=<encoded self>`; `/login` always
routes through `/onboard?next=…` next (which skips straight past its own
create-a-child form and forwards `next` immediately if the account already
has a child — see `src/routes/onboard.tsx`), so the same hop works whether
this is a brand-new signup or a returning parent who never finished
onboarding. `next` is attacker-controllable (anyone can hand out a link with
`?next=https://evil.example`), so it is allow-listed, not sanitized:
`src/lib/post-auth-redirect.ts` accepts only the three exact same-origin
paths `/subscribe`, `/app/parent`, `/app` (any query string of their own is
fine; a scheme anywhere in the value, even inside that query string, is
rejected outright) — anything else silently falls back to `/app`, never an
open redirect. Unit-tested branch by branch in
`scripts/post-auth-redirect.test.ts`.

**Pending/polling return state.** Stripe's webhook can land after the
browser already returned from checkout, so `/app/parent?checkout=pending`
never claims success on its own say-so (a return URL is a browser's claim,
forgeable by anyone who reads it once — entitlement is only ever granted by
`src/routes/api/webhooks/stripe.ts`). It polls the existing
`getParentOverview` query every 2s for up to 30s
(`src/routes/app/parent.tsx`, via `subscriptionActive` — a new field on that
query's response, computed by `isHouseholdActive()`), swaps to the normal
dashboard the moment that flips true, and otherwise shows a timeout message
with the support address after 30s. `?already=active` (branch 4's redirect
target) shows a small one-line notice on the normal dashboard instead of a
separate view — there is nothing to wait for there, the household was
already entitled before the visit.

**Verified from this environment:** typecheck, the full test suite (all 8
stages, including `single entitlement`/`derived subscription`/`webhook-only
entitlement`), and a live curl smoke test against the local dev server —
`/subscribe` with no plan and with a garbage plan both 302 to `/app/parent`;
`/subscribe?plan=monthly` and `/subscribe?plan=annual` both 302 to the
correct Stripe Payment Link with the same `client_reference_id` on repeat
calls (confirming the token is read, not re-minted); `/login`, `/onboard`,
and `/app/parent` all render (200) with the new search params. **Not
verifiable from this environment:** the actual signed-out branch of
`/subscribe` and the client-rendered pending/polling UI, both blocked by
this sandbox having no real sign-in provider configured (the same category
of constraint that blocked webhook Pass 1 above) — worth exercising once
from a real browser against a deployed environment before relying on it,
the same way R1 below is.

**Landing page CTAs — last, deliberately, once the resolver above is
deployed and directly verified signed-in and signed-out.** Four anchors in
`landingpage-densha`, replacing the current direct `buy.stripe.com` links
and the guest-door hero CTA:

```html
<!-- index.html hero -->
<a class="btn"  href="https://app.kanji-ai.jp/login?mode=signup">10日間 無料ではじめる</a>
<a class="btn2" href="pricing.html">プランを見る</a>
<!-- pricing.html -->
<a class="btn"  href="https://app.kanji-ai.jp/subscribe?plan=annual">年額プランに申し込む</a>
<a class="btn2" href="https://app.kanji-ai.jp/subscribe?plan=monthly">月額プランに申し込む</a>
```

None of this touches `src/components/trial-banner.tsx` (the parent
dashboard's own subscribe buttons) — those already run inside an
authenticated page that knows its household directly, so they keep using
`src/lib/checkout-link.ts`'s helpers rather than round-tripping through
`/subscribe`.

## Production verification, now that both domains are live

Five checks, cheapest to run now before real families exist. **None of these
are runnable from the environment that built this checklist** — outbound
HTTPS to arbitrary internet hosts is blocked by that sandbox's egress policy
(confirmed again during this pass: `gateway answered 403 to CONNECT`, same
block that stopped every reachability attempt throughout this build,
unrelated to whether the domains are actually live). Run them from a machine
with real network access.

1. **Routing contract + landing CTAs + DB reachability — automated.** `node
   scripts/smoke-production.mjs` checks `app.kanji-ai.jp/`, `/parents`,
   `/app/parent` all return 2xx; `GET /api/health-db` runs a real `select 1`
   against `DATABASE_URL` and returns 200 (catches a misconfigured or
   unreachable Neon connection before a parent's first signup, since the
   routing checks above never touch the database); `kanji-ai.jp/` returns
   2xx and `www.kanji-ai.jp/` 301/308s to the apex; and reads the deployed
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
- **Start the Stripe final-confirmation-screen check (item 4) early.** A
  default Stripe Checkout doesn't necessarily show all six 特商法-required
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

If Stripe checkout isn't fully verified by day 8 of the first cohort, extend
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

- Household/subscription/entitlement model, trial clock, Stripe webhook
  signature verification (`src/lib/stripe-signature.ts`) + idempotent apply
  (`applyStripeWebhook`, keyed on `billing_event.stripe_event_id`),
  server-side `canRide` enforcement across every ride entry point (not just
  the final answer write), and the lapsed-child disabled boarding pass — all
  tested, all in `Dynamic-Densha`.
- The Stripe webhook endpoint itself (`src/routes/api/webhooks/stripe.ts`),
  wired to the one legitimate caller of `applyStripeWebhook`
  (`scripts/check-webhook-only-entitlement.mjs` enforces that no other route
  can). Resolves a household via Stripe's own `client_reference_id` on
  `checkout.session.completed` (never by email — the opaque
  `household.checkout_token`, appended by the parent dashboard's subscribe
  buttons as `?client_reference_id=`), and via the cached
  `stripe_customer_id`/`stripe_subscription_id` for every later event.
- Trial-abuse guard (`trial_spent`): one trial per email, survives account
  deletion (no foreign key to household/user), verified against a standalone
  PGLite instance mirroring the real schema.
- Parent-facing trial status: the trial end date is visible from a
  household's first dashboard visit onward (not just near the end), and a
  household whose trial is already spent sees a clear message with two
  subscribe buttons (monthly, yearly) instead of a silent dead end.
- A5 (parent trial notices): no email infrastructure exists in this repo and
  none is being built pre-launch — the parent-dashboard banner above is the
  agreed substitute. Revisit real email once the domain (item 1) is settled.
- `pricing.html` / `tokushoho.html` (site root, `landingpage-densha`):
  operator, representative, address, contact email, phone-disclosure-on-
  request, price, payment terms, and cancellation/refund/read-only-after-
  lapse policy are all filled in and correct — no placeholders remain.
- The Unified Funnel resolver (`src/routes/subscribe.ts`), its pure decision
  core (`src/lib/subscribe-resolve.ts`), the `next` allow-list
  (`src/lib/post-auth-redirect.ts`), and the checkout-pending poll on
  `/app/parent` — see "Unified funnel" above for the full picture and what
  has/hasn't been verified live.

## How deploys work now (supersedes the manual steps above)

`merge to main` **is** the production deploy — `.github/workflows/deploy-production.yml`:

1. typecheck + full `npm test` (all gates, including additive-migration check)
2. migrations applied to Neon from CI, transactionally, before any traffic moves
   (fails closed if the `DATABASE_URL` secret is missing — never "skips")
3. candidate revision built at 0% traffic → `smoke-production.mjs` against its
   tagged URL on the real database → promote to 100% only on green → smoke the
   live domain → automatic traffic rollback to the previous revision on failure

So the "run this SQL in Neon" and "trigger the preview, then merge, then switch
traffic" loops above are gone. The manual production checks that remain
manual are the ones that need a human or a phone: R1 (sign-in survives a
redeploy — now trivially testable, since every merge is a redeploy), the
parity capture, and the real-device Safari ride.

**`DATABASE_URL` on the Cloud Run *service* itself** (distinct from the CI
`DATABASE_URL` secret above, which only the migrate step uses) is a separate,
one-time `gcloud run services update ... --update-env-vars DATABASE_URL=...`
against the *service*, not a GitHub Actions secret. Once set, `src/lib/db.ts`
and `src/lib/auth/server.ts` both now throw at process boot (not on first
request) if a real Cloud Run revision (`K_SERVICE` set) ever comes up without
it — previously a missing service-level `DATABASE_URL` was silently absorbed
by the ephemeral PGLite fallback, and the first sign a parent saw was a
signup 500. `scripts/smoke-production.mjs`'s `/api/health-db` check (above)
is the deploy-time backstop for the same class of bug — a `DATABASE_URL`
that's set but unreachable (wrong host, exhausted Neon connection limit).

**One-time setup, once, by a repo admin:**

| Repo | Secret | Why |
|---|---|---|
| `Dynamic-Densha` | `DATABASE_URL` | CI migrate step. Without it the deploy refuses to run (by design). |
| `landingpage-densha` | `GCP_SA_KEY` | Same service-account JSON `Dynamic-Densha` already has. Until added, landing deploys stay manual and the workflow only runs the gates. |

**Separately, not a GitHub Actions secret at all:** four env vars must be set
directly on the `Dynamic-Densha` Cloud Run *service* (`gcloud run services
update ... --set-env-vars STRIPE_WEBHOOK_SECRET=whsec_...,STRIPE_SECRET_KEY=sk_...,STRIPE_PRICE_MONTHLY_ID=price_...,STRIPE_PRICE_ANNUAL_ID=price_...`,
or the Console) — `deploy-production.yml`'s `gcloud run deploy` step never
passes `--set-env-vars`, so runtime env vars live on the service itself and
persist across deploys rather than being wired through CI the way
`DATABASE_URL` is. See `.env.example` for what each one is for.

| Env var | Where it comes from | What breaks without it |
|---|---|---|
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard → the webhook endpoint's own settings page | `src/routes/api/webhooks/stripe.ts` returns 500 and refuses every delivery — fails closed, same choice `db:migrate` makes for `DATABASE_URL`. |
| `STRIPE_SECRET_KEY` | Stripe Dashboard → API keys | `checkout.session.completed` can't look up the purchased price; the household still becomes entitled (state doesn't depend on plan) but `plan` is left unset and logged as an error. |
| `STRIPE_PRICE_MONTHLY_ID` / `STRIPE_PRICE_ANNUAL_ID` | Stripe Dashboard → Product catalog → each plan's own Price id (not the Payment Link id, not the amount) | Same failure mode as a missing `STRIPE_SECRET_KEY` — plan resolution logs an error and leaves `plan` unset rather than guessing (`src/lib/stripe-plan.ts`). |

Once all four are set, register the endpoint's URL
(`https://app.kanji-ai.jp/api/webhooks/stripe`) in the Stripe Dashboard so
deliveries actually start arriving.

**Verify it actually works before relying on it — a misconfigured secret
fails silently.** A wrong `STRIPE_WEBHOOK_SECRET` doesn't error anywhere a
parent (or you) would see; signature verification just quietly rejects every
delivery, forever, and no household is ever entitled. This needs two passes,
because they check different things — a canned test event can only prove the
endpoint is reachable and correctly signed, not that a household actually
gets entitled.

**Pass 1 — the endpoint exists and the secret is correct.** After setting
all four vars and registering the endpoint URL:

1. In the Stripe Dashboard, open the webhook endpoint and use **Send test
   webhook** for `checkout.session.completed`.
2. Confirm the Dashboard's delivery log shows `200`, not `400` (bad
   signature — `STRIPE_WEBHOOK_SECRET` is wrong) or `500` (secret not set at
   all).
3. Look at the response body the Dashboard shows for that delivery: it
   should read `{"ok":true,"skipped":"no household for token"}`, **not** a
   row appearing in `billing_event`. Stripe's canned test payload carries a
   placeholder `client_reference_id` that was never issued to a real
   household, so `getHouseholdIdByCheckoutToken` correctly finds nothing and
   the handler skips before ever writing anything — by design (§1 of this
   endpoint's invariants: entitlement is never granted to an unattributable
   event). That `skipped` body, not a database row, is what "the signature
   check and the routing logic both work" looks like from a canned test
   event.

**Pass 2 — a real checkout actually reaches billing_event.** Only Pass 1 can
be done with a canned Dashboard event; confirming the full chain (household
resolution through `applyStripeWebhook`) needs one real checkout carrying a
real `checkout_token`, which means either a Stripe **test-mode** Payment
Link pointed at this same endpoint (Stripe test-mode events verify against
the same `STRIPE_WEBHOOK_SECRET` and hit the same endpoint as live mode) or,
before the first real cohort, one real purchase. Whichever you use:

```bash
DATABASE_URL=<production Neon URL> node -e '
  const { Pool } = require("pg");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  pool.query("select id, type, received_at from billing_event order by received_at desc limit 1")
    .then((r) => { console.log(r.rows[0]); return pool.end(); });
'
```

A `subscription_created` row with a `received_at` matching when you checked
out means the whole chain — signature verification, `client_reference_id`
resolution, `applyStripeWebhook`, `recomputeSubscription` — actually works
end to end for a real household, not just that the endpoint responds.

The very first run of `deploy-production.yml` will apply migration 0010 and
ship the whole commerce module in one go — expected, and the additive gate
plus the 0%-traffic candidate smoke are exactly what make that safe to do
without a hand-run SQL step first.
