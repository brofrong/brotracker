# Authentik + Better Auth — design

Date: 2026-07-31  
Status: approved

## Goal

Protect BroTracker so unauthenticated users cannot use the UI or API. Dev stack runs Authentik in Docker; the app uses Authentik as an OIDC IdP via Better Auth and redirects straight to login when there is no session.

## Decisions

| Topic | Choice |
|--------|--------|
| Integration style | OIDC in the app (not reverse-proxy / outpost) |
| Who may access | Any Authentik user with a valid login |
| Session layer | Better Auth + Generic OAuth plugin (`providerId: "authentik"`) |
| Unauthenticated UX | Hard gate: any visit triggers OIDC sign-in, then return to original URL |
| Auth DB | BroTracker Postgres (Better Auth tables via Drizzle) |
| Authentik DB | Separate Postgres service in compose (not shared with app) |
| Prod Authentik | Out of scope for v1 compose; same env vars for an external issuer later |
| Legacy `users` table | Drop / replace with Better Auth schema (`user`, `session`, `account`, `verification`) |

## Architecture

```
Browser (:3100 SPA)
    │  no session → authClient.signIn.oauth2(authentik)
    ▼
Backend (:3101)
    ├── /api/auth/*     → Better Auth (toNodeHandler)
    ├── /trpc/*         → protectedProcedure (session required)
    └── static (prod)   → SPA assets (gate still runs in client)
    │
    ▼ OIDC
Authentik (:9080)  ← separate postgres + server + worker
```

Flow:

1. User opens any app route.
2. Frontend `beforeLoad` / root gate calls `authClient.getSession()`.
3. If no session → `signIn.oauth2({ providerId: "authentik", callbackURL })` → Authentik login.
4. Callback: `http://localhost:3101/api/auth/oauth2/callback/authentik` → Better Auth sets session cookie.
5. User returns to the app; tRPC calls send `credentials: "include"`.
6. tRPC context resolves session; missing session → `UNAUTHORIZED` (client may re-trigger OIDC).

## Dev infrastructure

Add to `docker/docker-compose.dev.yml` (aligned with official Authentik compose, tag pinned e.g. `2026.5.6`):

- `authentik-postgres` — Postgres 16, volume `authentik_postgres_data`
- `authentik-server` — `command: server`, host port **9080→9000** (9000 is MinIO)
- `authentik-worker` — `command: worker`

Secrets: `docker/authentik.env` (gitignored) from `docker/authentik.env.example`:

- `PG_PASS`, `AUTHENTIK_SECRET_KEY`
- `COMPOSE_PORT_HTTP=9080` (or fixed ports in compose)

One-time manual Authentik setup after first boot:

1. Open `http://localhost:9080` → initial admin setup.
2. Create OAuth2/OIDC Provider + Application `brotracker`.
3. Redirect URI: `http://localhost:3101/api/auth/oauth2/callback/authentik`
4. Copy client id/secret into backend `.env`.

## App env

Backend (`apps/backend/.env.example`):

- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL=http://localhost:3101`
- `AUTHENTIK_CLIENT_ID`
- `AUTHENTIK_CLIENT_SECRET`
- `AUTHENTIK_DISCOVERY_URL` — application discovery, e.g.  
  `http://localhost:9080/application/o/brotracker/.well-known/openid-configuration`

Frontend: auth client `baseURL` = backend origin (`VITE_BACKEND_URL` or equivalent already used for tRPC).

## Code touchpoints

| Area | Change |
|------|--------|
| `apps/backend/src/auth/auth.ts` | `betterAuth` + drizzle adapter + `genericOAuth` |
| `apps/backend/src/index.ts` | Mount `/api/auth` via `toNodeHandler(auth)` before static/tRPC |
| `apps/backend/src/trpc.ts` | Context with session; `protectedProcedure` |
| Routers | Switch business procedures to `protectedProcedure` |
| Drizzle | Generate Better Auth schema; drop unused `users` |
| Frontend | `auth-client.ts`, hard gate on root route, optional logout in nav |

## Errors & edges

- tRPC without cookie → `UNAUTHORIZED`; UI gate / error handler starts OIDC again.
- Authentik cancel/error → `errorCallbackURL` back to app; gate retries login.
- WebSocket subscriptions use the same `createContext` + cookie.
- Cookie: `SameSite=Lax`; `Secure` only behind HTTPS.
- Public without login: only `/api/auth/*` (and static assets).

## Out of scope (v1)

- Authentik in production `docker-compose.yml`
- Group / whitelist authorization
- Local email/password in Better Auth
- Authentik outpost / reverse-proxy protection
- Fancy login interstitial page

## Manual test plan

1. Start dev compose including Authentik; complete admin + OIDC app.
2. Configure backend env; migrate DB; run `bun dev`.
3. Open `http://localhost:3100` logged out → redirect to Authentik.
4. Log in → land back in app; search/settings/torrents work.
5. Clear session cookie → gate again.
6. Call `/trpc/...` without cookie → `UNAUTHORIZED`.
