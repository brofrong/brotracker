# syntax=docker/dockerfile:1

# --- full monorepo install (frontend build needs Vite / React / etc.) ---
FROM oven/bun:1.4-alpine AS deps
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

# --- production deps only (backend + rutracker-ts workspaces) ---
FROM oven/bun:1.4-alpine AS prod-deps
WORKDIR /app

ENV NODE_ENV=production

COPY package.json bun.lock turbo.json ./
COPY apps/backend/package.json apps/backend/
COPY packages/rutracker-ts/package.json packages/rutracker-ts/
COPY packages/typescript-config/package.json packages/typescript-config/

# Keep workspace globs valid without pulling frontend/runtime UI deps.
# Drop the monorepo lockfile after stubbing frontend — otherwise bun refuses
# to rewrite it (frozen) when package.json no longer matches.
RUN mkdir -p apps/frontend \
	&& printf '%s\n' '{"name":"frontend","private":true}' > apps/frontend/package.json \
	&& bun -e 'const p=await Bun.file("package.json").json(); delete p.devDependencies; await Bun.write("package.json", JSON.stringify(p, null, 2) + "\n")' \
	&& bun -e 'const p=await Bun.file("apps/backend/package.json").json(); delete p.devDependencies; await Bun.write("apps/backend/package.json", JSON.stringify(p, null, 2) + "\n")' \
	&& bun -e 'const p=await Bun.file("packages/rutracker-ts/package.json").json(); delete p.devDependencies; await Bun.write("packages/rutracker-ts/package.json", JSON.stringify(p, null, 2) + "\n")' \
	&& rm -f bun.lock \
	&& bun install --production

# --- runtime: Bun backend + static SPA ---
FROM oven/bun:1.4-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
ENV STATIC_DIR=/app/apps/backend/public

COPY package.json bun.lock turbo.json ./
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
