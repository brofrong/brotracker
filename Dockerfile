# syntax=docker/dockerfile:1

# --- full monorepo install (frontend build needs Vite / React / etc.) ---
FROM oven/bun:1.4-alpine AS deps
WORKDIR /app

COPY package.json bun.lock turbo.json bunfig.toml ./
COPY apps/backend/package.json apps/backend/
COPY apps/frontend/package.json apps/frontend/
COPY packages/rutracker-ts/package.json packages/rutracker-ts/
COPY packages/typescript-config packages/typescript-config/

RUN bun install --frozen-lockfile

# --- frontend SPA build (assets served by backend) ---
FROM deps AS frontend-build
WORKDIR /app

COPY apps/frontend apps/frontend
COPY apps/backend apps/backend
COPY packages packages
# Root package.json already copied in deps; refresh after workspace copy so
# vite can read the release version for VITE_APP_VERSION.
COPY package.json ./

# Empty = same-origin /trpc when backend serves the SPA.
# Version defaults from root package.json (override with --build-arg APP_VERSION=…).
ARG APP_VERSION=
ENV VITE_BACKEND_URL=
ENV VITE_APP_VERSION=$APP_VERSION

WORKDIR /app/apps/frontend
RUN bun run build

# --- production deps (frozen lockfile; frontend SPA is copied as static assets) ---
FROM oven/bun:1.4-alpine AS prod-deps
WORKDIR /app

ENV NODE_ENV=production

COPY package.json bun.lock turbo.json bunfig.toml ./
COPY apps/backend/package.json apps/backend/
COPY apps/frontend/package.json apps/frontend/
COPY packages/rutracker-ts/package.json packages/rutracker-ts/
COPY packages/typescript-config/package.json packages/typescript-config/

# Keep bun.lock so pinned better-auth cannot float to an untested minor.
RUN bun install --frozen-lockfile --production --linker=hoisted

# --- runtime: Bun backend + static SPA ---
FROM oven/bun:1.4-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
ENV STATIC_DIR=/app/apps/backend/public

COPY package.json bun.lock turbo.json bunfig.toml ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/apps/backend/package.json ./apps/backend/package.json
COPY --from=prod-deps /app/apps/frontend/package.json ./apps/frontend/package.json
COPY --from=prod-deps /app/packages/rutracker-ts/package.json ./packages/rutracker-ts/package.json
COPY --from=prod-deps /app/packages/typescript-config/package.json ./packages/typescript-config/package.json

COPY apps/backend/src apps/backend/src
COPY apps/backend/drizzle apps/backend/drizzle
COPY packages/rutracker-ts/src packages/rutracker-ts/src
COPY --from=frontend-build /app/apps/frontend/dist/client ./apps/backend/public

WORKDIR /app/apps/backend
EXPOSE 8080

CMD ["bun", "run", "src/index.ts"]
