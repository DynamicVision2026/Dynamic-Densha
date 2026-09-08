# Cloud Run container build for the Nitro/TanStack Start app.
#
# Two-stage build:
#   1. `build` installs deps and produces a self-contained Nitro
#      "node-server" bundle (server/index.mjs + public assets). This preset
#      is distinct from the `vercel` preset used for Vercel deployments
#      (see vite.config.ts) — it emits a standalone Node HTTP server instead
#      of serverless functions.
#   2. `runtime` copies only the built output into a slim Node image and
#      runs it. No node_modules are needed at runtime: Nitro bundles all
#      server dependencies into the output.
#
# DATABASE_URL is intentionally NOT required: when unset, the app falls
# back to an in-memory PGLite database (see src/lib/db.ts), which is what
# a --no-traffic preview revision should use unless a real Postgres
# connection string is supplied via Cloud Run env vars.

FROM node:20-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
# `npm ci` is preferred for reproducibility, but this repo's committed
# package-lock.json currently has pre-existing drift from package.json
# (unrelated to this PR — confirmed via `npm ci`'s EUSAGE error on ajv/
# json-schema-traverse/fast-uri versions). Using `npm install` here so the
# container build succeeds; recommend re-running `npm install` and
# committing the refreshed lockfile separately to restore `npm ci` safety.
RUN npm install

COPY . .
RUN npm run build:container

# Known Nitro/vinxi node-server-preset quirk: the internal SSR-render Vite
# pass produces its own copy of the global stylesheet with a different
# content hash than the client build's copy in .output/public/assets, and
# at least one server chunk embeds a string reference to that internal
# hash instead of the client one. Nitro's static-asset server appears to
# use a build-time manifest of known public files rather than a live
# directory scan, so simply adding a same-named file after the fact is
# NOT picked up (confirmed by testing) -- the fix has to rewrite the
# stale reference itself to point at the real, already-known-good file.
# Since this project currently emits exactly one global CSS file, this is
# a safe, hash-agnostic textual rewrite scoped to compiled server output
# only (no app/UI source is touched).
RUN node -e "\
  const fs = require('fs'); const path = require('path'); \
  const assetsDir = '.output/public/assets'; \
  const cssFiles = fs.readdirSync(assetsDir).filter((f) => f.endsWith('.css')); \
  if (cssFiles.length !== 1) { console.log('skip: expected exactly one global css file, found', cssFiles); process.exit(0); } \
  const real = cssFiles[0]; \
  const walk = (dir, out) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p, out); else if (e.name.endsWith('.mjs')) out.push(p); } }; \
  const files = []; walk('.output/server', files); \
  for (const f of files) { \
    let c = fs.readFileSync(f, 'utf8'); \
    const before = c; \
    c = c.replace(/assets\/styles-[A-Za-z0-9_-]+\.css/g, 'assets/' + real); \
    if (c !== before) { fs.writeFileSync(f, c); console.log('rewrote stale css ref in', f, '-> assets/' + real); } \
  } \
"

# Second Nitro/Rolldown quirk -- NON-DETERMINISTIC, confirmed by rebuilding
# the identical source (both this commit and the prior, already-deployed
# one) repeatedly: most builds are fine, but some produce a broken
# .output/server/_ssr/ssr.mjs that 500s on every request. Root-caused via a
# real local reproduction (booted the actual built image and curled it),
# not guessed:
#
# ssr.mjs is a thin barrel that imports the real renderer from ./ssr2.mjs
# under whatever local name Rolldown chose for it (e.g. `server_default`,
# matching ssr2.mjs's own `var server_default = createServerEntry(...)`)
# and is SUPPOSED to re-export that same binding under two names --
# `default`, and whatever single-letter alias Nitro's lazy vite-service
# loader in _chunks/ssr-renderer.mjs asks for (`import("../_ssr/ssr.mjs").
# then((n) => n[ALIAS])`, e.g. `n.s` -- the exact letter shifts between
# builds along with everything else Rolldown renumbers, so this must not be
# hardcoded to `s`). On a bad build, Rolldown gets the `default` alias
# right but emits `ssr_exports as <ALIAS>` for the second one --
# `ssr_exports` is never defined or imported anywhere in the file, which is
# a genuine `SyntaxError: Export 'ssr_exports' is not defined in module` at
# that dynamic import, on every request. It does not crash at process
# boot -- the server starts and listens fine; every request 500s because
# the SSR service itself fails to load.
#
# The fix reuses the local name ssr.mjs's own (correct) `default` alias
# already points at, read back out of its own import line -- not a
# hardcoded guess -- and repoints the broken alias at it. If a build
# doesn't reproduce this bug at all, this step is a no-op (skip); if the
# bug is present but the expected import shape has changed enough that the
# fix can't derive a safe replacement, it FAILS THE BUILD rather than
# silently shipping a guessed patch.
#
# A second, independent instance of the same underlying non-determinism was
# found and fixed below (both root-caused via real local reproduction --
# building this exact commit repeatedly, then booting and curling the
# actual built server -- not guessed from the error text alone).
RUN node -e "\
  const fs = require('fs'); \
  const file = '.output/server/_ssr/ssr.mjs'; \
  if (!fs.existsSync(file)) { console.log('skip: ' + file + ' not found (build layout may have changed)'); process.exit(0); } \
  const c = fs.readFileSync(file, 'utf8'); \
  const danglingMatch = c.match(/\bssr_exports as ([\w$]+)\b/); \
  if (!danglingMatch) { console.log('skip: no dangling ssr_exports re-export in ' + file); process.exit(0); } \
  const alias = danglingMatch[1]; \
  const importMatch = c.match(/import\s*\{([^}]*)\}\s*from\s*[\"']\.\/ssr2\.mjs[\"']/); \
  if (!importMatch) { console.error('ERROR: dangling ssr_exports export found in ' + file + ' but no \"./ssr2.mjs\" import to repair it from -- refusing to guess'); process.exit(1); } \
  const specMatch = importMatch[1].match(/\bdefault as ([\w$]+)\b/) || importMatch[1].match(new RegExp('\\\\b' + alias + ' as ([\\\\w$]+)\\\\b')); \
  if (!specMatch) { console.error('ERROR: dangling ssr_exports export found in ' + file + ' but its ./ssr2.mjs import has no usable specifier to repair from -- refusing to guess'); process.exit(1); } \
  const localName = specMatch[1]; \
  fs.writeFileSync(file, c.replace(new RegExp('\\\\bssr_exports as ' + alias + '\\\\b'), localName + ' as ' + alias)); \
  console.log('fixed dangling ssr_exports re-export (alias \"' + alias + '\") in ' + file + ' -> reused local binding ' + localName); \
"

# ssr.mjs and ssr2.mjs import from each other (ssr.mjs needs the renderer
# from ssr2.mjs; ssr2.mjs needs a small __exportAll-style helper back from
# ssr.mjs) -- a legitimate circular ESM pair on its own, except ssr2.mjs
# calls that helper EAGERLY at its own module top level (`var
# server_exports = __exportAll$1(...)`), before control ever returns to
# finish evaluating ssr.mjs's side of the cycle. Node's live-binding
# semantics mean the imported name exists but is still unset at that point,
# so the call becomes `undefined(...)` -- `TypeError: __exportAll$1 is not
# a function`, on every request, independent of (and surviving) the fix
# above. The same helper is ALSO defined, non-circularly, in
# .output/server/_runtime.mjs (already bare-imported -- `import
# \"../_runtime.mjs\";` -- by both ssr.mjs and ssr2.mjs, just not
# destructured), so the fix repoints ssr2.mjs's import of it there instead
# of back through ssr.mjs -- verified against that file's own export list,
# not hardcoded -- which breaks the cycle entirely rather than reordering
# around it. Same no-op-if-absent / fail-if-unrepairable discipline as
# above.
RUN node -e "\
  const fs = require('fs'); \
  const file = '.output/server/_ssr/ssr2.mjs'; \
  if (!fs.existsSync(file)) { console.log('skip: ' + file + ' not found (build layout may have changed)'); process.exit(0); } \
  const c = fs.readFileSync(file, 'utf8'); \
  const badImportMatch = c.match(/import\s*\{\s*([\w$]+)\s+as\s+(__exportAll[\w$]*)\s*\}\s*from\s*[\"']\.\/ssr\.mjs[\"'];?/); \
  if (!badImportMatch) { console.log('skip: no circular __exportAll import from ./ssr.mjs in ' + file); process.exit(0); } \
  const fullImportLine = badImportMatch[0]; \
  const localName = badImportMatch[2]; \
  const runtimeFile = '.output/server/_runtime.mjs'; \
  if (!fs.existsSync(runtimeFile)) { console.error('ERROR: ' + file + ' has a circular __exportAll import from ./ssr.mjs, but ' + runtimeFile + ' is missing -- refusing to guess'); process.exit(1); } \
  const runtimeSrc = fs.readFileSync(runtimeFile, 'utf8'); \
  const exportMatch = runtimeSrc.match(/export\s*\{([^}]*)\}/); \
  const aliasMatch = exportMatch && exportMatch[1].match(/\b__exportAll as (\w+)\b/); \
  if (!aliasMatch) { console.error('ERROR: ' + file + ' has a circular __exportAll import from ./ssr.mjs, but ' + runtimeFile + ' does not export __exportAll -- refusing to guess'); process.exit(1); } \
  const runtimeAlias = aliasMatch[1]; \
  fs.writeFileSync(file, c.replace(fullImportLine, 'import { ' + runtimeAlias + ' as ' + localName + ' } from \"../_runtime.mjs\";')); \
  console.log('fixed circular __exportAll import in ' + file + ' -> now imports from ../_runtime.mjs'); \
"

# Fail the build here, not three minutes and a Cloud Run deploy later, if
# the two fixes above (or the build itself) didn't actually produce a
# working SSR entry module -- loads it exactly the way
# _chunks/ssr-renderer.mjs does at request time (import(), not require()),
# so any remaining or future instance of this non-determinism surfaces as a
# build failure instead of a production 500.
RUN node -e "\
  import('./.output/server/_ssr/ssr.mjs') \
    .then(() => { console.log('ssr.mjs loads cleanly'); process.exit(0); }) \
    .catch((err) => { console.error('ERROR: .output/server/_ssr/ssr.mjs failed to load -- this build would 500 on every request:'); console.error(err); process.exit(1); }); \
"

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/.output ./.output

# Cloud Run injects $PORT; Nitro's node-server preset reads it natively.
ENV PORT=8080
EXPOSE 8080

CMD ["node", ".output/server/index.mjs"]
