# Optional local auth (no Authentik) — design

Date: 2026-08-03  
Status: approved

## Goal

Make Authentik optional for test/dev (and any deploy without an IdP). When `AUTHENTIK_CLIENT_ID` is unset, the app uses email/password with a one-time bootstrap registration. When it is set, behavior stays as today (Authentik OIDC only).

## Decisions

| Topic | Choice |
|--------|--------|
| Mode switch | Non-empty `AUTHENTIK_CLIENT_ID` → `authentik`; otherwise → `local` |
| Local credentials | Email + password (Better Auth `emailAndPassword`) |
| Registration | Open only while `user` table is empty; then login-only |
| Authentik mode UX | Unchanged: hard redirect to OAuth |
| Local mode UX | `/login` page; AuthGate / 401 → navigate there |
| How frontend learns mode | Public API (runtime), not a Vite bake-in |
| Email verification / reset | Out of scope |
| Local ↔ Authentik migration | Out of scope |

## Mode selection

| `AUTHENTIK_CLIENT_ID` | Mode | Sign-in |
|------------------------|------|---------|
| Set (non-empty after trim) | `authentik` | OAuth via Authentik |
| Unset / empty / whitespace | `local` | Email + password |

If `AUTHENTIK_CLIENT_ID` is set, `AUTHENTIK_CLIENT_SECRET` is required (fail startup if missing). Discovery URL keeps its default.

Docker compose / `.env.example`: remove `change-me` defaults for Authentik vars so omitting them yields local mode. CI keeps setting Authentik vars → authentik mode.

## Architecture

```
Browser
  │  no session
  ▼
AuthGate → GET /api/auth/mode
  ├── authentik → signIn.oauth2(authentik)
  └── local     → /login (register if open, else sign-in)
        │
        ▼
Backend createAuth(secret)
  ├── authentik → genericOAuth only
  └── local     → emailAndPassword only
```

### Public auth mode endpoint

Unauthenticated, e.g. `GET /api/auth/mode`:

```json
{ "mode": "authentik" | "local", "registrationOpen": boolean }
```

`registrationOpen` is `true` only in local mode when there are zero rows in `user`.

### Local bootstrap

1. First visitor sees registration on `/login` (email, name optional/defaulted, password, confirm).
2. `signUp.email` succeeds → session cookie → app.
3. Further sign-ups rejected server-side even if the UI is bypassed (runtime guard on sign-up; not a one-time config flag at process start).
4. Sign-out → `/login` (not Authentik).

### AuthGate / unauthorized redirect

1. Session present → render app.
2. Else fetch mode.
3. `authentik` → existing OAuth redirect.
4. `local` → navigate to `/login`.

tRPC `UNAUTHORIZED` uses the same policy.

## Error handling

- Bad credentials → generic form error (no email enumeration).
- Sign-up when users already exist → rejected (“registration closed”).
- Concurrent first sign-ups → one wins; loser gets closed/conflict.
- Authentik mode: email sign-up/sign-in endpoints not enabled.

## Tests

- Env parsing: optional Authentik → local; full set → authentik; ID without secret → fail.
- Mode endpoint / registration gate: open when empty, closed after first user; sign-up rejected when closed.
- Unauthorized redirect: local → `/login`, authentik → OAuth (extend existing unit tests).

## Out of scope

- Password reset / email verification
- Multiple local admins after bootstrap
- Username plugin
- Migrating users between local and Authentik
- Auto-login / auth-less mode with no credentials
