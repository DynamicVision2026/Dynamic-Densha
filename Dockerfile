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

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/.output ./.output

# Cloud Run injects $PORT; Nitro's node-server preset reads it natively.
ENV PORT=8080
EXPOSE 8080

CMD ["node", ".output/server/index.mjs"]
