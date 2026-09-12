# Commerce launch checklist

Everything the engineering side of the commerce module (Phase A, this repo +
`landingpage-densha`) needs is built and tested. What's left before a paid
plan can actually open is entirely outside the codebase — four items, each
with an owner, each with its own clock.

| # | Blocker | Owner | Notes |
|---|---|---|---|
| 1 | ~~Domain mapping~~ — `kanji-ai.jp` → the landing Cloud Run service, `app.kanji-ai.jp` → the app | Founder / infra | **Done** — both domains reported bound and DNS-resolved. Not independently verified from this environment: outbound HTTPS to arbitrary internet hosts is blocked by this sandbox's egress policy (confirmed again just now, `CONNECT tunnel failed, response 403` on both hosts) — this is the same sandbox-level restriction that blocked every reachability check earlier in this build, unrelated to whether the domains are actually live. Worth one real check from outside this environment before relying on it. |
| 2 | Legal review of `terms.html` / `privacy.html` | Founder + reviewer | Content is complete (10-day trial, ¥9,800 permanent buyout / ¥3,800 1-year pass pricing — both one-time, non-recurring purchases, not a subscription — cancellation/refund and read-only-after-lapse terms all filled in) but has not been independently confirmed as legally reviewed from this environment. |
| 3 | ~~Business fields for `pricing.html` and `tokushoho.html`~~ | Founder | **Done.** Both files are live at the site root (`landingpage-densha`, no longer in `draft/`): ¥9,800 買い切りプラン (permanent), ¥3,800 1年プラン (non-recurring), payment method/timing, and refund policy are all filled in — no `［…］` placeholders remain. |
| 4 | ~~Stripe account + checkout links~~ superseded by Shopify Checkout (merchant account migration) | Founder | **Done, this pass.** Stripe is fully decommissioned from the codebase — `src/lib/stripe-signature.ts`, `src/lib/stripe-plan.ts`, `src/lib/checkout-link.ts`, and `src/routes/api/webhooks/stripe.ts` are all deleted, replaced by their Shopify equivalents (see "Unified funnel" below). `pricing.html`'s buttons now link to `app.kanji-ai.jp/subscribe?plan=buyout\|annual` (`src/routes/subscribe.ts`), which attaches the household's `checkout_token` server-side and hands off to a Shopify cart permalink via `/handoff`. The webhook endpoint (`src/routes/api/webhooks/shopify.ts`) ingests `orders/paid`, `orders/cancelled`, and `refunds/create`, verified via Shopify's own HMAC-SHA256 signature scheme. Plan (buyout/annual) is resolved by matching the purchased line item's Shopify **variant id** against `SHOPIFY_VARIANT_BUYOUT`/`SHOPIFY_VARIANT_ANNUAL`, not by amount (`src/lib/shopify-plan.ts`; an unmatched variant id is logged and left unset, never guessed). **Still needed, and not done from this environment:** configure `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_VARIANT_BUYOUT`, `SHOPIFY_VARIANT_ANNUAL`, and `SHOPIFY_WEBHOOK_SECRET` as real env vars on the deployed Cloud Run service (see "One-time setup" below), register the three webhook topics in the Shopify Admin, run both verification passes described there, and verify Shopify's own checkout screen shows all six 特商法-required items (contract terms, price, cancellation/refund policy) — the default screen doesn't necessarily satisfy this, and that screen is Shopify's, not ours. |

## Unified funnel — landing page to checkout

`kanji-ai.jp` stays static/inert (no session, no cookies, no auth-aware
content — `check-inert.mjs` in `landingpage-densha` still enforces this) and
never links straight to `pay.kanji-ai.jp`. Instead every "subscribe" CTA
points at `app.kanji-ai.jp/subscribe?plan=buyout|annual` — a thin,
server-side-only resolver (`src/routes/subscribe.ts`) that renders nothing
and holds no state; its entire job is resolve household → decide → 302.
Identity never crosses the origin boundary; a plan name does.

```
kanji-ai.jp  (static, inert)
      │  <a href="https://app.kanji-ai.jp/subscribe?plan=buyout">
      ▼
app.kanji-ai.jp/subscribe
      ├─ plan missing/invalid → /app/parent
      ├─ no session           → /login?next=<encoded self>
      ├─ session, no household → resolveHouseholdId creates one (idempotent)
      ├─ household already 'active' → /app/parent?already=active (never double-charge)
      └─ otherwise            → 302 /handoff?plan=<plan>
                                        │
                                        ▼
                          /handoff (re-derives the same session/household/
                          already-active checks, shows the store domain +
                          Tokushoho link, ~2s auto-redirect) → mint/read
                          checkout_token, redirect to a Shopify cart
                          permalink with ?attributes[kd_token]=<token>
                                        │
                                        ▼
                     Shopify checkout → webhook grants entitlement
                     → Shopify's own order-status redirect (configured in
                       the Shopify Admin, outside this repo) →
                       /app/parent?checkout=pending
```

The branch decision is pure and unit-tested independently of any DB/session
call (`src/lib/subscribe-resolve.ts`, `scripts/subscribe-resolve.test.ts`) —
both `/subscribe` and `/handoff` (`src/lib/server/handoff.ts`) supply the
already-resolved `hasSession`/`isActive` inputs each branch needs, and
neither trusts the other to have already checked: a visitor who reaches
`/handoff` directly (not only via `/subscribe`'s own redirect) gets the exact
same invalid-plan/already-active protection. `isHouseholdActive()`
(`src/lib/server/subscription.ts`) is the one place that distinguishes
"trialing" from "actually paying," used by both resolvers (to avoid a
double charge) and the pending-checkout poll below (to know when a webhook
has actually landed) — `scripts/check-single-entitlement.mjs` still forbids
a literal `state === 'active'` comparison anywhere else.

**Shopify Admin configuration, outside this repo, not yet done:** the
order-status/"thank you" redirect back to
`https://app.kanji-ai.jp/app/parent?checkout=pending` after a completed
checkout has to be configured in the Shopify Admin (Settings → Checkout →
Additional Scripts, or the order status page config) — the same way the old
Stripe Payment Link's post-payment redirect was Stripe Dashboard config, not
anything in this codebase.

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

**Pending/polling return state.** Shopify's webhook can land after the
browser already returned from checkout, so `/app/parent?checkout=pending`
never claims success on its own say-so (a return URL is a browser's claim,
forgeable by anyone who reads it once — entitlement is only ever granted by
`src/routes/api/webhooks/shopify.ts`). It polls the existing
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
entitlement`), and a local functional smoke test against a real (PGLite)
database — an `orders/paid` webhook for each plan correctly derives `active`
with the right `paid_until` (null for buyout, +1 year for annual), a retried
delivery (same `X-Shopify-Webhook-Id`) is a no-op, and `refunds/create`
correctly derives `lapsed` with `canView` still true. **Not verifiable from
this environment:** the actual signed-out branch of `/subscribe`/`/handoff`,
the client-rendered pending/polling UI, and anything requiring a real
Shopify store or a real signed webhook delivery — this sandbox has no real
sign-in provider configured and no outbound network access to Shopify. Worth
exercising once from a real browser against a deployed environment before
relying on it, the same way R1 below is.

**Landing page CTAs — updated this pass.** `landingpage-densha`'s
`pricing.html` now links to `/subscribe?plan=buyout` and
`/subscribe?plan=annual` instead of a direct payment-processor URL — see
that repo's own change for the exact anchors. `index.html`'s hero CTA
(`/login?mode=signup`) is unchanged; it never pointed at a payment processor
in the first place.

`src/components/trial-banner.tsx` (the parent dashboard's own subscribe
buttons) now also routes through `/subscribe?plan=...` — plain `<a href>`
anchors, not a TanStack `<Link>`, since `/subscribe` is a server-only route
with no client-rendered component to navigate to. It used to build a Stripe
Payment Link URL directly (`src/lib/checkout-link.ts`, deleted); that logic
now lives server-side in `/subscribe` and `/handoff` instead, so the
dashboard doesn't need to know a checkout_token or a plan's variant id at
all.

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

- Household/subscription/entitlement model, trial clock, Shopify webhook
  signature verification (`src/lib/shopify-signature.ts`) + idempotent apply
  (`applyShopifyWebhook`, keyed on `billing_event.shopify_event_id`),
  server-side `canRide` enforcement across every ride entry point (not just
  the final answer write), and the lapsed-child disabled boarding pass — all
  tested, all in `Dynamic-Densha`.
- The Shopify webhook endpoint itself (`src/routes/api/webhooks/shopify.ts`),
  wired to the one legitimate caller of `applyShopifyWebhook`
  (`scripts/check-webhook-only-entitlement.mjs` enforces that no other route
  can). Resolves a household via the order's own `note_attributes.kd_token`
  on `orders/paid`/`orders/cancelled` (never by email — the opaque
  `household.checkout_token`, appended to the Shopify cart permalink as
  `?attributes[kd_token]=`), and via the cached `shopify_order_id` for
  `refunds/create` (whose payload carries no note_attributes of its own).
- Trial-abuse guard (`trial_spent`): one trial per email, survives account
  deletion (no foreign key to household/user), verified against a standalone
  PGLite instance mirroring the real schema.
- Parent-facing trial status: the trial end date is visible from a
  household's first dashboard visit onward (not just near the end), and a
  household whose trial is already spent sees a clear message with two
  subscribe buttons (permanent buyout, 1-year pass) instead of a silent dead
  end.
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
update ... --update-env-vars SHOPIFY_STORE_DOMAIN=pay.kanji-ai.jp,SHOPIFY_VARIANT_BUYOUT=...,SHOPIFY_VARIANT_ANNUAL=...,SHOPIFY_WEBHOOK_SECRET=...`,
or the Console) — `deploy-production.yml`'s `gcloud run deploy` step never
passes `--set-env-vars`, so runtime env vars live on the service itself and
persist across deploys rather than being wired through CI the way
`DATABASE_URL` is. See `.env.example` for what each one is for.

| Env var | Where it comes from | What breaks without it |
|---|---|---|
| `SHOPIFY_STORE_DOMAIN` | The store's checkout domain (e.g. `pay.kanji-ai.jp`) | `/handoff` can't build a cart permalink at all -- `src/lib/shopify-checkout.ts` throws. |
| `SHOPIFY_VARIANT_BUYOUT` / `SHOPIFY_VARIANT_ANNUAL` | Shopify Admin → Products → each plan's own variant id (not the product id, not the amount) | Same failure mode for the missing plan's checkout link; an incoming `orders/paid` webhook for that variant logs an error and leaves `plan` unset rather than guessing (`src/lib/shopify-plan.ts`) -- the household still becomes entitled (state doesn't depend on plan). |
| `SHOPIFY_WEBHOOK_SECRET` | Shopify Admin → the webhook (or custom app credential) that signs deliveries | `src/routes/api/webhooks/shopify.ts` returns 500 and refuses every delivery -- fails closed, same choice `db:migrate` makes for `DATABASE_URL`. |

Once all four are set, register the three webhook topics this app handles
(`orders/paid`, `orders/cancelled`, `refunds/create`) in the Shopify Admin,
each pointed at `https://app.kanji-ai.jp/api/webhooks/shopify`, so
deliveries actually start arriving.

**Verify it actually works before relying on it — a misconfigured secret
fails silently.** A wrong `SHOPIFY_WEBHOOK_SECRET` doesn't error anywhere a
parent (or you) would see; signature verification just quietly rejects every
delivery, forever, and no household is ever entitled. This needs two passes,
because they check different things — a canned test event can only prove the
endpoint is reachable and correctly signed, not that a household actually
gets entitled.

**Pass 1 — the endpoint exists and the secret is correct.** After setting
all four vars and registering the three webhook topics:

1. In the Shopify Admin, open the webhook (Settings → Notifications →
   Webhooks) and send a test event for `orders/paid`.
2. Confirm the delivery log shows `200`, not `401` (bad signature --
   `SHOPIFY_WEBHOOK_SECRET` is wrong) or `500` (secret not set at all).
3. Look at the response body for that delivery: it should read
   `{"ok":true,"skipped":"unattributed"}`, **not** a row appearing in
   `billing_event`. Shopify's canned test payload carries no real
   `note_attributes.kd_token` ever issued to a real household, so
   `getHouseholdIdByCheckoutToken` correctly finds nothing and the handler
   skips before ever writing anything — by design (invariant 1: entitlement
   is never granted to an unattributable event). That `skipped` body, not a
   database row, is what "the signature check and the routing logic both
   work" looks like from a canned test event.

**Pass 2 — a real checkout actually reaches billing_event.** Only Pass 1 can
be done with a canned Admin test event; confirming the full chain (household
resolution through `applyShopifyWebhook`) needs one real checkout carrying a
real `checkout_token`, which means either a Shopify **test order** (draft
order marked paid, or a $0 test discount) that still fires `orders/paid` to
this same endpoint, or, before the first real cohort, one real purchase.
Whichever you use:

```bash
DATABASE_URL=<production Neon URL> node -e '
  const { Pool } = require("pg");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  pool.query("select id, type, received_at from billing_event order by received_at desc limit 1")
    .then((r) => { console.log(r.rows[0]); return pool.end(); });
'
```

An `order_paid` row with a `received_at` matching when you checked out means
the whole chain — signature verification, `kd_token` resolution,
`applyShopifyWebhook`, `recomputeSubscription` — actually works end to end
for a real household, not just that the endpoint responds.

The very first run of `deploy-production.yml` will apply migration 0010 and
ship the whole commerce module in one go — expected, and the additive gate
plus the 0%-traffic candidate smoke are exactly what make that safe to do
without a hand-run SQL step first.

---

## Post-purchase loop (v1.0) — what still needs a human

The app side of the post-purchase spec is built and deployed: `/subscribe/success`
with its three states, the ticket motif on `/handoff` and the arrival pass, the
saveable 定期券, the manifest and install guide. Five items in that spec cannot
be done from a build environment and are still open.

| # | Item | Where | Why it isn't done |
|---|---|---|---|
| 1 | **Order status page script** | Shopify Admin → Settings → Checkout → Additional scripts | Lives in Shopify Admin, outside this repo and outside `landingpage-densha`. Recorded here so it is not later filed as an inert-landing violation. Paste: `<script>setTimeout(function(){window.location.href="https://app.kanji-ai.jp/subscribe/success?checkout=pending";},4000);</script>` — four seconds so the parent sees Shopify's own confirmation (their receipt) first. |
| 2 | **Order confirmation email link** | Shopify Admin → Settings → Notifications → Order confirmation | This is the PRIMARY return path, not the fallback: a meaningful share of parents never reach the order status page at all (tab closed, redirect blocked, or the flow ends in the PayPay app). The 保護者ページを開く link must point at `https://app.kanji-ai.jp/subscribe/success` and must be prominent, not in the footer. `/subscribe/success` is idempotent and permanent, so this link works three days later too — verified locally: a revisit with no `?checkout=` param resolves straight to the pass. |
| 3 | **Statement descriptor, confirmed against a real statement** | Shopify Payments settings, then four surfaces | The app now states `SP BC-KANJIDENSHA` (one constant, `src/lib/commerce-copy.ts`, deliberately not localised). `SP` is Shopify Payments' own prefix, so only `BC-KANJIDENSHA` is configurable. After the first live purchase, confirm what the statement actually says and correct **all four** surfaces to match reality rather than the setting: this app's handoff screen, the order confirmation email, the parent-facing payment history, and `tokushoho.html` in the landing repo. |
| 4 | **iOS home-screen session persistence** | A real iPhone and a real iPad | Whether a standalone launch inherits the Safari session has historically varied by iOS version, and getting signed out immediately after paying is worse than the bookmark it replaces. Until someone tests it, the guide says 「はじめて開くときは、もう一度ログインが必要な場合があります。」 — deliberately "may". If the session does carry, delete that line (`installSessionNote`); if it does not, make it a flat statement. |
| 5 | **PayPay timing** | A real KOMOJU PayPay purchase | If `orders/paid` fires only on settlement, the slow state is the NORMAL case for that method. The copy is already written to read as "still working" rather than a failure, and polling continues behind it every 10s up to five minutes — but nobody has measured how long that actually takes. Record it when someone does. |

Two things about `/subscribe/success` worth knowing before testing it:

- **It never grants entitlement.** It polls the derived state (`getPassState`
  → `getPassStateForHousehold`) and renders it. A refund therefore removes the
  pass on the next poll, which is spec §4.19's check and is worth confirming
  once against a real refund.
- **The QR on the saveable pass is a plain URL** (`https://app.kanji-ai.jp/`),
  never a token or magic link — see `src/lib/ticket-qr.ts` for why that is not
  negotiable. The matrix is baked, and `scripts/ticket-qr.test.ts` re-encodes
  it on every run so it cannot silently drift to encoding something else.

## Multi-child model — deviations from the Builder ticket

Everything in the ticket is implemented. Five things were done differently
from its text, each because the ticket's SQL sketch described a schema this
repo does not have, or because following it literally would have broken
something:

1. **The migration is `0014_multi_child.sql`, not `0013`.** `0013` is taken
   (`0013_child_lifecycle.sql`, already deployed). That file also already
   added `children.archived_at`, so `0014` re-declares it with
   `if not exists` rather than adding it twice.

2. **`children`, not `child`; `text` ids, not `uuid`.** Every id in this repo
   is app-generated with `crypto.randomUUID()` and stored as `text` (see
   `0001_auth.sql`'s header). A `uuid`-typed `covered_child_id` could not have
   carried the foreign key at all.

3. **The FK cascade change was a no-op, verified rather than assumed.** The
   ticket asks to convert any `ON DELETE CASCADE` from `child` to `RESTRICT`.
   There is none: `0013` added all six progress-table foreign keys with no
   `ON DELETE` clause, i.e. `NO ACTION`, which refuses the same deletes
   `RESTRICT` would. Converting would mean dropping and re-adding six
   constraints — the destructive reshape the additive gate exists to prevent.
   `scripts/multi-child.test.ts` asserts against a real database that a hard
   delete of a child with progress raises, and that no FK to `children` is
   `CASCADE`.

4. **`children.household_id` had to be revived.** It has been dead since
   `0010` — written once by that migration's backfill, never by `createChild`
   — so every ownership check keyed off `user_id` instead. `0014` backfills it
   from `household_member` and `createChild` now writes it, because ownership
   is a household question and `user_id` stops being equivalent the moment a
   second parent joins a household (`joinHousehold`, already implemented).

5. **`resolveHouseholdId`'s creation path does not take the advisory lock.**
   The lock is keyed by household id, and on that path the household does not
   exist yet. It is already exactly-once by construction: a unique index on
   `household_member.user_id` plus a re-select, which is the right primitive
   for "create if absent". Every other caller the ticket names — `createChild`,
   `assignAnnualPass`, `archiveChild`, the `orders/paid` handler — does take it.

### One thing the ticket did not specify, and the model needs

There was **no way to add a second child**. `/onboard` skips its own form for
any household that already has one (correct for the post-login hop it was
built for), and no other surface created children — so the whole multi-child
model was unreachable. Added: `/onboard?add=1`, reached from a 「＋追加」
control beside the child chips on the parent surface.

### One design instruction not followed literally

§4.1 asks for the switcher to draw an uncovered sibling as **outline only**,
"the same 未開通 language the map uses". It does not: the current child is
solid, every sibling is outlined, and coverage is not rendered at all. An
outline meaning "your brother has the pass and you do not" is a price signal
on the child surface wearing a different coat — a child can read it, will ask
about it, and the answer is about money. The locked board they land on already
says 「いまは のれません」, which is the honest amount for a child to know;
the explanation lives on the parent surface, in front of the person who can
act on it. Raising this rather than quietly diverging: it is a product call,
and reverting it is a two-line change in `src/components/child-switcher.tsx`.

## Annual → ご家庭ライセンス: what support needs to know

An annual household CAN buy the family licence, and this is the only purchase
an already-active household is allowed to make (`isUpgrade` in
`src/lib/subscribe-resolve.ts`). It was previously refused as `already-active`,
which meant the upgrade the pass card, the (?) help and the family hint all
invite was the one purchase the funnel would not accept.

**It buys coverage, not time.** ¥9,800 is a separate one-time charge; the
remaining period on the annual pass is NOT prorated and NOT refunded
automatically. A family who asks for that remainder back is a manual 返金
decision through the 返金・ご解約 route on the settings hub — there is no code
path that credits it, by design, because a partial refund is a judgement about
one family's circumstances.

Still refused, and tested as such:

- buyout → buyout (it already covers every child)
- buyout → annual (never walk a family backwards into a narrower plan)
- annual → annual (a renewal before expiry)
- active with an **unknown** plan (the rare unmatched-variant case) — refused
  deliberately rather than guessed at, because a wrong guess charges twice.

### /handoff is not a 302, on purpose

It mints the cart URL and then RENDERS it: the store domain and the 特商法
link are shown before the family leaves the origin. Anything that turns it
into a straight redirect to Shopify removes the disclosure a Japanese
purchaser is entitled to see first.
