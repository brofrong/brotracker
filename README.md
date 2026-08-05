# BroTracker

Self-hosted torrent search and download helper. Search RuTracker, cache results locally, fetch covers, and monitor downloads in qBittorrent — from one UI.

> **Intended for personal / local use.** Sign-in is always required. Without `AUTHENTIK_CLIENT_ID`, the first visitor registers with email/password (then login-only). With Authentik configured, OIDC is used instead — see [docker/AUTHENTIK.md](docker/AUTHENTIK.md). Do not expose the app without TLS.

## Features

- **Local-first search** — query cached torrents in Postgres (`pg_trgm`), fall back to live RuTracker when needed
- **Cover images** — background fetch + MinIO/S3 storage
- **qBittorrent** — live status over WebSocket subscriptions
- **In-app settings** — RuTracker credentials, proxy, qBittorrent URL / API key
- **Cloudflare bypass** — [Byparr](https://github.com/thephaseless/byparr) (FlareSolverr-compatible) for RuTracker access

## Stack

| Layer | Tech |
|--------|------|
| Monorepo | Bun workspaces + Turborepo |
| Backend | Bun, tRPC, Drizzle ORM, Postgres, MinIO |
| Frontend | React 19, TanStack Router/Query, Vite, Astryx |
| Tracker client | `@brotracker/rutracker-ts` (workspace package) |

## Repository layout

```
apps/
  backend/     # Bun HTTP + WebSocket API, serves SPA in production
  frontend/    # Vite SPA (search, torrents, settings)
packages/
  rutracker-ts/          # RuTracker client (login, search, CF bypass)
  typescript-config/     # Shared TypeScript configs
docker/                  # Compose files for infra (+ full stack)
```

## Prerequisites

- [Bun](https://bun.sh) `>= 1.2`
- [Docker](https://docs.docker.com/get-docker/) (Postgres, MinIO, Byparr)
- A [qBittorrent](https://www.qbittorrent.org/) instance with Web UI / API enabled (optional but needed for the Torrents page)

## Quick start (development)

### 1. Install

```bash
bun install
```

### 2. Start infrastructure

```bash
docker compose -f docker/docker-compose.dev.yml up -d
```

This starts:

| Service | Port |
|---------|------|
| Postgres | `5432` |
| MinIO | `9000` (API), `9001` (console) |
| Byparr | `8191` |

### 3. Environment

Copy examples and adjust if needed:

```bash
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env.local
```

Defaults match the compose file (local Postgres / MinIO / Byparr).

### 4. Run apps

```bash
bun run dev
```

- Frontend: http://localhost:3100  
- Backend (tRPC): http://localhost:3101/trpc  

Open **Settings** in the UI and configure RuTracker + qBittorrent, then use **Test** before searching.

Database migrations run automatically when the backend starts.

## Production (Docker)

Build and run the full stack (app + Postgres + MinIO + Byparr):

```bash
docker compose -f docker/docker-compose.yml up --build
```

App: http://localhost:3101  

Compose uses demo credentials (`brotracker` / `minioadmin`). Change them before any networked deployment.

## Environment variables

### Backend (`apps/backend`)

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://brotracker:brotracker@localhost:5432/brotracker` | Postgres connection |
| `PORT` | `3101` | HTTP / WS port |
| `CORS_ORIGIN` | `http://localhost:3100` | Allowed browser origin |
| `S3_ENDPOINT` | `http://localhost:9000` | MinIO / S3 endpoint |
| `S3_ACCESS_KEY` | `minioadmin` | S3 access key |
| `S3_SECRET_KEY` | `minioadmin` | S3 secret key |
| `S3_BUCKET` | `brotracker` | Cover bucket |
| `BYPARR_URL` | `http://localhost:8191/v1` | Cloudflare solver API |
| `STATIC_DIR` | _(unset)_ | SPA assets dir (set in Docker) |
| `BETTER_AUTH_URL` | `http://localhost:3101` | Public backend URL for auth callbacks |
| `AUTHENTIK_CLIENT_ID` | _(optional)_ | When set, enables Authentik OIDC; when unset, local email/password |
| `AUTHENTIK_CLIENT_SECRET` | _(optional)_ | Required together with `AUTHENTIK_CLIENT_ID` |
| `AUTHENTIK_DISCOVERY_URL` | see `.env.example` | Authentik OpenID discovery endpoint |

RuTracker and qBittorrent credentials are stored in the database via the Settings UI, not via env. The Better Auth signing secret is auto-generated into `app_settings` on first boot. OIDC setup steps: [docker/AUTHENTIK.md](docker/AUTHENTIK.md).

### Frontend (`apps/frontend`)

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_BACKEND_URL` | `""` | Backend host for tRPC/WS. Empty = same origin (production). Dev: `http://localhost:3101` |

## CI / Docker Hub

GitHub Actions (`.github/workflows/ci.yml`):

| Event | What runs |
|-------|-----------|
| PR / push to `main` | Unit tests + Docker image **build** (no push) |
| Tag `v*` (e.g. `v1.0.0`) | Unit tests + build + **push** to Docker Hub |

Image: `brofrong/brotracker` (`:1.0.0`, `:1.0`, `:1`, `:latest`).

Add repository secrets:

| Secret | Value |
|--------|-------|
| `DOCKERHUB_USERNAME` | Docker Hub username |
| `DOCKERHUB_TOKEN` | Docker Hub [access token](https://hub.docker.com/settings/security) |

### Release

Version lives in the root `package.json` and is baked into the frontend at build time (`VITE_APP_VERSION`).

Before releasing, add one markdown file per change under `changes/unreleased/`:

```markdown
---
type: feature
---

Short description of the change.
```

`type` is `feature`, `fix`, or `breaking`. The release script assembles these into GitHub Release notes, then archives them to `changes/vX.Y.Z/`.

```bash
bun run release              # interactive patch/minor/major
bun run release patch        # 0.1.0 → 0.1.1
bun run release minor        # 0.1.0 → 0.2.0
bun run release 1.0.0        # set exact version
bun run release patch --yes  # skip confirmation
bun run release patch --dry-run
bun run release patch --notes-file /path/to/draft-notes.md
```

The script requires release notes (from `changes/unreleased/` or `--notes-file`), bumps the version, commits, creates annotated tag `vX.Y.Z`, pushes branch + tag, creates a [GitHub Release](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository) with the assembled notes, and archives note files (CI publishes the Docker image on tag push).

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start all apps in watch mode |
| `bun run build` | Build all packages/apps |
| `bun run test` | Backend + rutracker-ts unit tests |
| `bun run release` | Bump version, tag, and push a release |
| `bun run lint` | Lint via Turbo |
| `bun run check-types` | Typecheck via Turbo |

Backend DB helpers (from `apps/backend`):

```bash
bun run db:generate
bun run db:migrate
bun run db:studio
```

## Security notes

- Auth protects all tRPC procedures and WebSocket subscriptions; unauthenticated requests receive `UNAUTHORIZED`.
- Without Authentik: local email/password with one-time bootstrap registration (first user only).
- With Authentik: OIDC — restrict who can sign in via Authentik policies.
- Settings still store RuTracker / qBittorrent credentials in the database.
- Never commit `.env`, `.env.local`, `docker/authentik.env`, or real OIDC client secrets.
- Default Docker passwords are for local demos only.

## License

MIT © [brofrong](https://github.com/brofrong)
