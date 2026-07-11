# syntax=docker/dockerfile:1

# Built from the monorepo root: docker build -f apps/api/Dockerfile .
# (apps/api depends on packages/shared as an npm workspace, so the build
# context has to be the repo root, not apps/api itself.)

ARG NODE_VERSION=20-alpine

# ---- deps: full install (incl. devDependencies), needed to build ----------
FROM node:${NODE_VERSION} AS deps
WORKDIR /repo
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci

# ---- build: compile packages/shared then apps/api -------------------------
FROM deps AS build
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w packages/shared \
 && npm run build -w apps/api

# ---- prod-deps: production-only install for the runtime image -------------
FROM node:${NODE_VERSION} AS prod-deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci --omit=dev --workspace=apps/api --workspace=packages/shared

# ---- runtime: minimal image, no build tools, non-root user ----------------
FROM node:${NODE_VERSION} AS runtime
ENV NODE_ENV=production
WORKDIR /repo

RUN addgroup -S nodejs && adduser -S nodejs -G nodejs

COPY --from=prod-deps --chown=nodejs:nodejs /repo/node_modules ./node_modules
COPY --from=prod-deps --chown=nodejs:nodejs /repo/apps/api/package.json ./apps/api/package.json
COPY --from=prod-deps --chown=nodejs:nodejs /repo/packages/shared/package.json ./packages/shared/package.json
COPY --from=build --chown=nodejs:nodejs /repo/apps/api/dist ./apps/api/dist
COPY --from=build --chown=nodejs:nodejs /repo/packages/shared/dist ./packages/shared/dist

USER nodejs
WORKDIR /repo/apps/api

# PORT is read by apps/api/src/config/env.ts at boot; hosts like
# Railway/Render inject their own value at runtime, this is the local-run
# default.
ENV PORT=4000
EXPOSE 4000

# Dependency-free healthcheck (no curl in the base image) hitting the
# existing GET /api/health route.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "dist/index.js"]
