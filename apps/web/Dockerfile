# syntax=docker/dockerfile:1

# Built from the monorepo root: docker build -f apps/web/Dockerfile .
# (apps/web depends on packages/shared as an npm workspace, so the build
# context has to be the repo root, not apps/web itself.)

ARG NODE_VERSION=20-alpine

# ---- deps: full install (incl. devDependencies), needed to build ----------
FROM node:${NODE_VERSION} AS deps
WORKDIR /repo
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci

# ---- build: compile packages/shared, then next build apps/web -------------
FROM deps AS build
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build -w packages/shared

# Baked into the client bundle at build time (Next.js inlines
# NEXT_PUBLIC_* vars) — pass the real deployed backend URL via
# `docker build --build-arg NEXT_PUBLIC_API_URL=https://...`.
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
RUN npm run build -w apps/web

# ---- runtime: Next's traced "standalone" output, minimal + non-root -------
FROM node:${NODE_VERSION} AS runtime
ENV NODE_ENV=production
WORKDIR /repo

RUN addgroup -S nodejs && adduser -S nodejs -G nodejs

# .next/standalone already contains only the node_modules subset Next
# traced as actually required, nested at apps/web/ to mirror this monorepo
# layout (verified by inspecting the real build output — see
# apps/web/next.config.ts's `output: "standalone"`). static assets and
# public/ are not part of the trace and must be copied in separately.
COPY --from=build --chown=nodejs:nodejs /repo/apps/web/.next/standalone ./
COPY --from=build --chown=nodejs:nodejs /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=nodejs:nodejs /repo/apps/web/public ./apps/web/public

USER nodejs

ENV PORT=3000
# Docker sets HOSTNAME to the container ID by default, and Next's standalone
# server binds to that literal value instead of all interfaces if it's set
# to anything other than an IP — verified directly: without this, the app
# was only reachable via the container's own Docker-assigned IP, not
# 127.0.0.1, which broke the HEALTHCHECK below (and would break any other
# same-container tooling expecting localhost to work). 0.0.0.0 binds every
# interface, matching what EXPOSE/port-publishing already assumes.
ENV HOSTNAME=0.0.0.0
EXPOSE 3000

# Dependency-free healthcheck (no curl in the base image) hitting the app's
# own homepage.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "apps/web/server.js"]
