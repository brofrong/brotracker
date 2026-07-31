# BroTracker

Self-hosted torrent search and download helper. Search RuTracker, cache results locally, fetch covers, and monitor downloads in qBittorrent — from one UI.

> **Intended for personal / local use.** The API has no authentication. Do not expose it to the public internet without putting it behind your own auth (VPN, reverse proxy, etc.).

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
| `S3_PUBLIC_URL` | `http://localhost:9000/brotracker` | Public URL prefix for covers |
| `BYPARR_URL` | `http://localhost:8191/v1` | Cloudflare solver API |
| `STATIC_DIR` | _(unset)_ | SPA assets dir (set in Docker) |

RuTracker and qBittorrent credentials are stored in the database via the Settings UI, not via env.

### Frontend (`apps/frontend`)

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_BACKEND_URL` | `""` | Backend host for tRPC/WS. Empty = same origin (production). Dev: `http://localhost:3101` |

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start all apps in watch mode |
| `bun run build` | Build all packages/apps |
| `bun run lint` | Lint via Turbo |
| `bun run check-types` | Typecheck via Turbo |

Backend DB helpers (from `apps/backend`):

```bash
bun run db:generate
bun run db:migrate
bun run db:studio
```

## Security notes

- **No auth** on tRPC procedures — settings can return and update plaintext passwords / API keys.
- Keep the app on localhost or behind a VPN / authenticated reverse proxy.
- Never commit `.env`, `.env.local`, or `**/.data/` (session cookies live there).
- Default Docker passwords are for local demos only.

## License

MIT © [brofrong](https://github.com/brofrong)
