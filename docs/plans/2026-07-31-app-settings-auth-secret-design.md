# App settings + Better Auth secret in DB — design

Date: 2026-07-31  
Status: approved

## Goal

Store application-level settings in a dedicated Postgres table. Remove `BETTER_AUTH_SECRET` from environment variables; generate and persist it on first startup.

## Decisions

| Topic | Choice |
|--------|--------|
| Table shape | Key–value: `app_settings(key, value, updated_at)` |
| Secret key | `better_auth_secret` |
| Generation | `crypto.randomBytes(32).toString("base64url")` if missing |
| Concurrency | `INSERT … ON CONFLICT DO NOTHING`, then re-read |
| Auth init | `initAuth(secret)` after migrations; no env secret |

## Flow

1. `runMigrations()`
2. `ensureBetterAuthSecret()` → read or create row
3. `initAuth(secret)` → Better Auth singleton
4. Mount `/api/auth` + tRPC as today

## Out of scope

- Encrypting values at rest
- Admin UI for app settings
- Rotating the secret (would invalidate sessions)
