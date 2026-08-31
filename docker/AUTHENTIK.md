# Local Authentik OIDC setup

OIDC is **optional**. Without `OIDC_CLIENT_ID`, the app uses local email/password auth (first visitor registers; then login-only). Follow this guide when you want [Authentik](https://goauthentik.io/) as the IdP — any other OpenID Connect provider works the same way (set the three `OIDC_*` variables to that issuer).

A typical local Authentik listens on **9080** (MinIO uses 9000).

## 1. Authentik secret

From the repo root:

```bash
cp docker/authentik.env.example docker/authentik.env
```

Generate and set `AUTHENTIK_SECRET_KEY` in `docker/authentik.env`:

```bash
openssl rand -base64 60
```

## 2. Start the app stack

From the repo root (same as the main README):

```bash
docker compose -f docker/docker-compose.dev.yml up -d
```

This starts Postgres, MinIO, and Byparr. Start Authentik separately (or reuse an existing issuer).

## 3. Initial Authentik admin

Open [http://localhost:9080](http://localhost:9080) and complete the one-time admin account setup.

## 4. OAuth2/OIDC provider + application

In the Authentik admin UI:

1. **Applications → Providers → Create** — choose **OAuth2/OpenID Provider**.
2. Set **Redirect URIs** to:
   ```
   http://localhost:3101/api/auth/callback/oidc
   ```
   Production uses the same path on the public origin, e.g.
   `https://brotracker.brofrong.ru/api/auth/callback/oidc`.
   (Older BroTracker builds used `/api/auth/callback/authentik` and, before Better Auth 1.7, `/api/auth/oauth2/callback/authentik` — replace those URIs.)
3. **Applications → Applications → Create** — link the provider above.
4. Set the application **slug** to `brotracker` (used in the discovery URL below).

Copy the **Client ID** and **Client Secret** from the provider.

## 5. Backend environment

Copy `apps/backend/.env.example` to `apps/backend/.env` if needed, then set:

| Variable | Example / notes |
|----------|-----------------|
| `BETTER_AUTH_URL` | `http://localhost:3101` |
| `OIDC_CLIENT_ID` | From Authentik provider |
| `OIDC_CLIENT_SECRET` | From Authentik provider |
| `OIDC_DISCOVERY_URL` | `http://localhost:9080/application/o/brotracker/.well-known/openid-configuration` |

The Better Auth signing secret is generated automatically and stored in the `app_settings` table (`better_auth_secret`) on first backend start — do not set it via env.

Verify discovery responds after the app is created:

```bash
curl -s http://localhost:9080/application/o/brotracker/.well-known/openid-configuration | head
```

Run DB migrations, then start the backend (`bun run dev` from repo root).

## 6. Frontend environment

In `apps/frontend/.env.local` (from `.env.example`):

```
VITE_BACKEND_URL=http://localhost:3101
```

The auth client uses this as the Better Auth base URL (tRPC uses the same host).

## Troubleshooting

- **Callback errors** — redirect URI must match exactly (`/api/auth/callback/oidc`); `BETTER_AUTH_URL` must be `http://localhost:3101`.
- **CORS / cookies** — backend `CORS_ORIGIN` should be `http://localhost:3100` (frontend dev server).
- Do not commit `docker/authentik.env` or real client secrets.
