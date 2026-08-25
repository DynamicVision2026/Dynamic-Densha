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

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/.output ./.output

# Cloud Run injects $PORT; Nitro's node-server preset reads it natively.
ENV PORT=8080
EXPOSE 8080

CMD ["node", ".output/server/index.mjs"]
