# Contributing notes

## Kill the dev server before `git stash` / branch operations

`npm run dev` runs Vite with the TanStack Router file-route plugin, which
watches `src/routes/**` and regenerates a route file's contents (with
placeholder/boilerplate content) if it observes the file changing state —
including a transient change caused by `git stash` / `git stash pop` /
`git checkout` swapping a route file's on-disk content out and back in.

This has happened twice in one work session: a running dev server silently
overwrote `src/routes/app/index.tsx` with router-codegen boilerplate during a
`git stash` used for unrelated verification, discarding real, uncommitted
work in that file. It was caught only because the diff was being inspected
at that exact moment.

**Before any `git stash`, `git checkout <ref> -- <path>`, or branch switch,
kill any running dev server first** (`pkill -f "vite dev"` or equivalent),
and restart it afterward. Never assume a background dev server is inert
during a git operation that touches `src/routes/`.

## Shipping: merge to `main` is the deploy

`.github/workflows/deploy-production.yml` runs on every push to `main` and is
the only sanctioned path to `app.kanji-ai.jp`. Its stages are gates, in order:

1. **gates** — `npm run typecheck` + `npm test` (every stage, including the
   grep-based CI checks). Red here means nothing below runs.
2. **migrate** — `scripts/migrate.mjs` applies pending `migrations/*.sql` to
   Neon from one CI runner, one transaction per file, ledgered in
   `_migrations`. Never from container startup: scaling instances would race.
   Fails closed if the `DATABASE_URL` secret is missing (otherwise migrate.mjs
   would log "skipping" and the new code would meet a schema it never got).
3. **deploy** — builds the candidate revision at 0% traffic, smoke-tests it on
   its tagged URL against the real database (`scripts/smoke-production.mjs`),
   promotes it to 100% only if that passes, smokes the live domain, and rolls
   traffic back to the previously serving revision if that fails.

**Migrations must be additive** (`scripts/check-migrations-additive.mjs`,
part of `npm test`): the previous revision keeps serving on the new schema
while the candidate proves itself, so a migration must never drop or reshape
anything running code still reads. Add the new shape now; drop the old one in
a later migration once no serving revision references it. A genuinely
necessary exception carries a `-- allow-destructive: <reason>` line so it is
visible in review.

Day-to-day: work on a branch, open a PR, merge. There is no manual database
step and no manual `gcloud` step. `cloud-run-preview.yml` (manual, tagged,
0% traffic) still exists for looking at a branch before merging.
