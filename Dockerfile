# syntax=docker/dockerfile:1

FROM oven/bun:1.2 AS deps
WORKDIR /app

COPY package.json bun.lock turbo.json ./
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

# --- runtime: Bun backend + static SPA ---
FROM oven/bun:1.2 AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3101
ENV STATIC_DIR=/app/apps/backend/public

COPY package.json bun.lock turbo.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY apps/backend apps/backend
COPY packages packages
COPY --from=frontend-build /app/apps/frontend/dist/client ./apps/backend/public

WORKDIR /app/apps/backend
EXPOSE 3101

CMD ["bun", "run", "src/index.ts"]
