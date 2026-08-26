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
# at least one server chunk embeds a <link> reference to that internal
# hash instead of the client one. That internal file is never copied into
# .output/public, so the browser 404s on it. Since this project currently
# emits exactly one global CSS file, alias any CSS filename referenced by
# a server chunk but missing from public/assets to the real file's
# content, so whichever hash the HTML happens to reference resolves.
RUN node -e "\
  const fs = require('fs'); const path = require('path'); \
  const assetsDir = '.output/public/assets'; \
  const cssFiles = fs.readdirSync(assetsDir).filter((f) => f.endsWith('.css')); \
  if (cssFiles.length !== 1) { console.log('skip: expected exactly one global css file, found', cssFiles); process.exit(0); } \
  const refs = new Set(); \
  const walk = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith('.mjs')) { const c = fs.readFileSync(p, 'utf8'); const m = c.match(/assets\/styles-[A-Za-z0-9_-]+\.css/g); if (m) m.forEach((x) => refs.add(x)); } } }; \
  walk('.output/server'); \
  const src = path.join(assetsDir, cssFiles[0]); \
  for (const ref of refs) { const name = ref.split('/').pop(); const dest = path.join(assetsDir, name); if (!fs.existsSync(dest)) { fs.copyFileSync(src, dest); console.log('aliased missing css ref', name, '->', cssFiles[0]); } } \
"

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/.output ./.output

# Cloud Run injects $PORT; Nitro's node-server preset reads it natively.
ENV PORT=8080
EXPOSE 8080

CMD ["node", ".output/server/index.mjs"]
