# Authentik + Better Auth Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Run Authentik in dev Docker and protect BroTracker UI + tRPC so unauthenticated users are redirected to Authentik login.

**Architecture:** Authentik is the OIDC IdP. Better Auth on the backend handles OIDC (genericOAuth `authentik`), stores sessions in brotracker Postgres, and mounts `/api/auth/*`. Frontend hard-gates all routes; all business tRPC procedures require a session.

**Tech Stack:** Authentik (Docker), Better Auth + `@better-auth/drizzle-adapter` + `genericOAuth`, Drizzle/Postgres, tRPC standalone HTTP, TanStack Router, Bun.

**Design:** `docs/plans/2026-07-31-authentik-auth-design.md`

---

### Task 1: Authentik services in docker-compose.dev.yml

**Files:**
- Modify: `docker/docker-compose.dev.yml`
- Create: `docker/authentik.env.example`
- Modify: `.gitignore` — ignore `docker/authentik.env`

**Step 1: Add Authentik services**

Append (keep existing postgres/minio/byparr). Use official shape (no Redis on current Authentik):

```yaml
  authentik-postgres:
    image: docker.io/library/postgres:16-alpine
    container_name: brotracker-authentik-postgres
    restart: unless-stopped
    env_file:
      - authentik.env
    environment:
      POSTGRES_DB: ${PG_DB:-authentik}
      POSTGRES_USER: ${PG_USER:-authentik}
      POSTGRES_PASSWORD: ${PG_PASS:?database password required}
    volumes:
      - authentik_postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -d $${POSTGRES_DB} -U $${POSTGRES_USER}"]
      interval: 30s
      timeout: 5s
      retries: 5
      start_period: 20s

  authentik-server:
    image: ghcr.io/goauthentik/server:2026.5.6
    container_name: brotracker-authentik-server
    restart: unless-stopped
    command: server
    env_file:
      - authentik.env
    environment:
      AUTHENTIK_SECRET_KEY: ${AUTHENTIK_SECRET_KEY:?secret key required}
      AUTHENTIK_POSTGRESQL__HOST: authentik-postgres
      AUTHENTIK_POSTGRESQL__USER: ${PG_USER:-authentik}
      AUTHENTIK_POSTGRESQL__NAME: ${PG_DB:-authentik}
      AUTHENTIK_POSTGRESQL__PASSWORD: ${PG_PASS}
    ports:
      - "9080:9000"
      - "9443:9443"
    volumes:
      - authentik_data:/data
      - authentik_templates:/templates
    depends_on:
      authentik-postgres:
        condition: service_healthy
    shm_size: 512mb

  authentik-worker:
    image: ghcr.io/goauthentik/server:2026.5.6
    container_name: brotracker-authentik-worker
    restart: unless-stopped
    command: worker
    env_file:
      - authentik.env
    environment:
      AUTHENTIK_SECRET_KEY: ${AUTHENTIK_SECRET_KEY:?secret key required}
      AUTHENTIK_POSTGRESQL__HOST: authentik-postgres
      AUTHENTIK_POSTGRESQL__USER: ${PG_USER:-authentik}
      AUTHENTIK_POSTGRESQL__NAME: ${PG_DB:-authentik}
      AUTHENTIK_POSTGRESQL__PASSWORD: ${PG_PASS}
    volumes:
      - authentik_data:/data
      - authentik_templates:/templates
      - /var/run/docker.sock:/var/run/docker.sock
    depends_on:
      authentik-postgres:
        condition: service_healthy
    shm_size: 512mb
    user: root
```

Add volumes `authentik_postgres_data`, `authentik_data`, `authentik_templates`.

**Note:** Compose variable substitution for `${PG_PASS}` reads from the shell env / project `.env`. Prefer putting secrets only in `authentik.env` and **hardcoding env keys via `env_file` without `${PG_PASS:?}` in the YAML**, mirroring how secrets are loaded inside the container — OR document that `docker/authentik.env` must be passed with `--env-file docker/authentik.env`. Prefer the official pattern: `env_file: - authentik.env` and use `${PG_PASS}` with a root `docker/.env` symlink, **or** set passwords as plain defaults in `authentik.env.example` for local-only (e.g. `authentik-dev-pass`) and reference them only via `env_file` without compose interpolation:

```yaml
environment:
  POSTGRES_PASSWORD: ${PG_PASS}
```

Simplest local approach that works:

1. `docker/authentik.env.example` contains `PG_PASS=...`, `AUTHENTIK_SECRET_KEY=...`, `PG_USER=authentik`, `PG_DB=authentik`.
2. Run compose from `docker/` so `env_file: authentik.env` resolves, and also copy those vars into a `docker/.env` for interpolation — **or** avoid `${}` in compose and use fixed dev passwords in `environment:` for authentik postgres only (acceptable for local pet project).

**Recommended for this repo:** fixed local-only defaults in compose `environment` (like brotracker postgres already does), plus `AUTHENTIK_SECRET_KEY` from `authentik.env`:

```yaml
# authentik-postgres environment:
POSTGRES_USER: authentik
POSTGRES_PASSWORD: authentik
POSTGRES_DB: authentik

# server/worker:
AUTHENTIK_POSTGRESQL__HOST: authentik-postgres
AUTHENTIK_POSTGRESQL__USER: authentik
AUTHENTIK_POSTGRESQL__NAME: authentik
AUTHENTIK_POSTGRESQL__PASSWORD: authentik
AUTHENTIK_SECRET_KEY: ${AUTHENTIK_SECRET_KEY:?set in authentik.env}
```

And `authentik.env.example`:

```env
AUTHENTIK_SECRET_KEY=change-me-generate-with-openssl-rand-base64-60
```

**Step 2: gitignore**

Add `docker/authentik.env` to `.gitignore`.

**Step 3: Verify compose config**

Run: `cd docker && cp authentik.env.example authentik.env && docker compose -f docker-compose.dev.yml config`

Expected: valid YAML, Authentik services present, no port clash with `9000` (MinIO).

**Step 4: Commit**

```bash
git add docker/docker-compose.dev.yml docker/authentik.env.example .gitignore
git commit -m "chore: add Authentik services to dev compose"
```

---

### Task 2: Backend auth env + Better Auth instance

**Files:**
- Modify: `apps/backend/package.json` — add `better-auth`, `@better-auth/drizzle-adapter`
- Modify: `apps/backend/src/utils/env.ts`
- Modify: `apps/backend/.env.example`
- Create: `apps/backend/src/auth/auth.ts`
- Create: `apps/backend/src/db/auth/auth.schema.ts` (after CLI generate — may be Task 3)

**Step 1: Install**

Run from repo root:

```bash
cd apps/backend && bun add better-auth @better-auth/drizzle-adapter
```

**Step 2: Extend env**

```ts
BETTER_AUTH_SECRET: z.string().min(32),
BETTER_AUTH_URL: z.string().url().default("http://localhost:3101"),
AUTHENTIK_CLIENT_ID: z.string().min(1),
AUTHENTIK_CLIENT_SECRET: z.string().min(1),
AUTHENTIK_DISCOVERY_URL: z
  .string()
  .url()
  .default(
    "http://localhost:9080/application/o/brotracker/.well-known/openid-configuration",
  ),
```

Update `.env.example` accordingly (placeholder secrets OK).

**Step 3: Create `auth.ts`**

```ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { genericOAuth } from "better-auth/plugins";
import { db } from "../db/db";
import { env } from "../utils/env";
import * as authSchema from "../db/auth/auth.schema";

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.CORS_ORIGIN],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: authSchema,
  }),
  plugins: [
    genericOAuth({
      config: [
        {
          providerId: "authentik",
          discoveryUrl: env.AUTHENTIK_DISCOVERY_URL,
          clientId: env.AUTHENTIK_CLIENT_ID,
          clientSecret: env.AUTHENTIK_CLIENT_SECRET,
          scopes: ["openid", "profile", "email"],
          pkce: true,
        },
      ],
    }),
  ],
});
```

If schema file does not exist yet, generate in Task 3 first, then wire adapter.

**Step 4: Commit**

```bash
git add apps/backend/package.json apps/backend/bun.lock apps/backend/src/utils/env.ts apps/backend/.env.example apps/backend/src/auth/auth.ts
git commit -m "feat: add Better Auth config for Authentik OIDC"
```

---

### Task 3: Better Auth Drizzle schema + drop legacy `users`

**Files:**
- Create: `apps/backend/src/db/auth/auth.schema.ts` (via CLI)
- Modify: `apps/backend/src/db/schema.ts`
- Delete or stop exporting: `apps/backend/src/db/user/user.schema.ts`
- Generate migration under `apps/backend/drizzle/`

**Step 1: Generate schema**

From `apps/backend` (with `auth.ts` pointing at output path if needed):

```bash
bun x auth@latest generate --config src/auth/auth.ts --output src/db/auth/auth.schema.ts --yes
```

If CLI path flags differ, follow Better Auth CLI docs (`bun x auth@latest generate`).

**Step 2: Export schema**

In `schema.ts`:

```ts
export * from "./auth/auth.schema";
// remove: export { users } from "./user/user.schema";
```

Remove unused `user.schema.ts` if nothing else imports it.

**Step 3: Migration**

```bash
cd apps/backend && bun run db:generate
```

Ensure SQL drops `"users"` and creates Better Auth tables (`user`, `session`, `account`, `verification` — exact names from generated schema).

**Step 4: Apply locally**

```bash
cd apps/backend && bun run db:migrate
```

Expected: migrate OK against local brotracker postgres.

**Step 5: Commit**

```bash
git add apps/backend/src/db apps/backend/drizzle
git commit -m "feat: add Better Auth tables and drop legacy users"
```

---

### Task 4: Mount `/api/auth` on tRPC HTTP server

**Files:**
- Modify: `apps/backend/src/index.ts`
- Modify: `apps/backend/src/http/static.ts` — skip `/api/auth` if static catch-all could steal it (check `tryServeStatic`)

**Step 1: Mount handler**

```ts
import { toNodeHandler } from "better-auth/node";
import { auth } from "./auth/auth";

const authHandler = toNodeHandler(auth);

// inside middleware, after CORS, before static:
const url = req.url ?? "";
if (url.startsWith("/api/auth")) {
  return authHandler(req, res);
}
```

**Step 2: Smoke-check**

With backend running and env set:

```bash
curl -s http://localhost:3101/api/auth/ok
```

Expected: Better Auth OK payload (not 404).

**Step 3: Commit**

```bash
git add apps/backend/src/index.ts apps/backend/src/http/static.ts
git commit -m "feat: mount Better Auth handler on /api/auth"
```

---

### Task 5: tRPC session context + protectedProcedure

**Files:**
- Modify: `apps/backend/src/trpc.ts`
- Create: `apps/backend/src/trpc/context.ts` (optional; can live in `trpc.ts`)
- Modify: `apps/backend/src/index.ts` — pass `createContext` to HTTP + WS
- Modify: `apps/backend/src/appRouter.ts`
- Modify: `apps/backend/src/torrent/torrent.router.ts`
- Modify: `apps/backend/src/qbittorent/qbittorent.router.ts`
- Modify: `apps/backend/src/settings/settings.router.ts`
- Test: `apps/backend/src/auth/auth-guard.test.ts` (unit on middleware behavior if extractable)

**Step 1: Context**

```ts
import { fromNodeHeaders } from "better-auth/node";
import type { CreateHTTPContextOptions } from "@trpc/server/adapters/standalone";
import type { CreateWSSContextFnOptions } from "@trpc/server/adapters/ws";
import { auth } from "./auth/auth";

export async function createContext(
  opts: CreateHTTPContextOptions | CreateWSSContextFnOptions,
) {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(opts.req.headers),
  });
  return { session };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
```

Wire `initTRPC.context<Context>().create()`.

**Step 2: protectedProcedure**

```ts
import { TRPCError } from "@trpc/server";

export const protectedProcedure = t.procedure
  .use(loggingMiddleware)
  .use(({ ctx, next }) => {
    if (!ctx.session?.user) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }
    return next({
      ctx: {
        session: ctx.session,
        user: ctx.session.user,
      },
    });
  });
```

**Step 3: Switch routers**

Replace `publicProcedure` with `protectedProcedure` on all business routes (`torrent`, `qbittorent`, `settings`). Keep `hello` protected too (or delete). No anonymous API in v1.

**Step 4: Pass createContext**

```ts
createHTTPServer({ router: appRouter, createContext, ... });
applyWSSHandler({ wss, router: appRouter, createContext, ... });
```

**Step 5: Quick test**

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3101/trpc/hello
```

Expected: error JSON with UNAUTHORIZED (or HTTP 401 depending on adapter).

**Step 6: Commit**

```bash
git add apps/backend/src
git commit -m "feat: require Better Auth session on all tRPC procedures"
```

---

### Task 6: Frontend auth client + hard gate

**Files:**
- Modify: `apps/frontend/package.json` — add `better-auth`
- Create: `apps/frontend/src/utils/auth-client.ts`
- Modify: `apps/frontend/src/routes/__root.tsx` (or dedicated `_authenticated` layout)
- Modify: `apps/frontend/src/utils/env.ts` if needed for auth baseURL
- Modify: `apps/frontend/src/components/navigation/navigation.tsx` — logout control

**Step 1: Install + client**

```bash
cd apps/frontend && bun add better-auth
```

```ts
// auth-client.ts
import { createAuthClient } from "better-auth/client";
import { genericOAuthClient } from "better-auth/client/plugins";
import { env } from "./env";

function getAuthBaseURL(): string {
  const host = env.VITE_BACKEND_URL.trim();
  if (!host || host === "/") return ""; // same origin in prod
  if (host.startsWith("http")) return host.replace(/\/+$/, "");
  return `http://${host}`;
}

export const authClient = createAuthClient({
  baseURL: getAuthBaseURL(),
  plugins: [genericOAuthClient()],
});
```

**Step 2: Hard gate**

In root route `beforeLoad` (client):

```ts
beforeLoad: async ({ location }) => {
  const session = await authClient.getSession();
  if (!session.data?.session) {
    const callbackURL =
      typeof window !== "undefined"
        ? window.location.href
        : location.href;
    await authClient.signIn.oauth2({
      providerId: "authentik",
      callbackURL,
    });
    throw new Error("Redirecting to Authentik");
  }
  return { session: session.data };
},
```

Adjust for TanStack Start SSR: gate must run only where `window`/cookies work; prefer client-side redirect helper if `beforeLoad` runs on server without cookies to backend. Pattern: small `AuthGate` component that `useEffect`s session check and redirects, rendering `null`/spinner until ready — acceptable if `beforeLoad` is awkward with separate origins (`:3100` → `:3101`).

**Preferred for split-origin dev:** `AuthGate` wrapper in `RootDocument` / shell:

1. `authClient.getSession()`
2. If missing → `signIn.oauth2({ providerId: "authentik", callbackURL: window.location.href })`
3. Else render children

Also: on tRPC `UNAUTHORIZED`, trigger the same sign-in once.

**Step 3: Logout**

In nav footer/section: button calling `authClient.signOut()` then re-run gate (or `signIn.oauth2` again).

**Step 4: Manual check**

Open `http://localhost:3100` → Authentik → back to app.

**Step 5: Commit**

```bash
git add apps/frontend
git commit -m "feat: redirect unauthenticated users to Authentik"
```

---

### Task 7: Docs for local Authentik OIDC app setup

**Files:**
- Create: `docker/README-authentik.md` (short) **or** add section to existing README if present
- Prefer minimal: comments in `authentik.env.example` + short `docs/plans` already cover flow; add `docker/AUTHENTIK.md` with redirect URI and discovery URL

**Steps:** Document:

1. `cp docker/authentik.env.example docker/authentik.env` and set secret
2. `docker compose -f docker/docker-compose.dev.yml up -d`
3. Visit `http://localhost:9080` → create admin
4. Create Provider (OAuth2/OpenID) + Application slug `brotracker`
5. Redirect URI `http://localhost:3101/api/auth/oauth2/callback/authentik`
6. Copy client id/secret into `apps/backend/.env`
7. Discovery: `http://localhost:9080/application/o/brotracker/.well-known/openid-configuration`

**Commit**

```bash
git add docker/AUTHENTIK.md
git commit -m "docs: Authentik OIDC setup for local BroTracker"
```

---

### Task 8: End-to-end verification

**Step 1:** Compose up (postgres, minio, byparr, authentik*).

**Step 2:** Backend migrate + `bun run dev` (turbo).

**Step 3:** Checklist from design:

- [ ] Unauthenticated UI → Authentik
- [ ] Login → app works (search / torrents / settings)
- [ ] tRPC without cookie → UNAUTHORIZED
- [ ] Logout → gate again
- [ ] `/api/auth/ok` responds

**Step 4:** Fix any cookie/`trustedOrigins`/CORS issues if callback fails (common: mismatched `BETTER_AUTH_URL`, wrong redirect URI, missing `credentials`).

No further commit unless fixes needed.

---

## Execution notes

- Do not commit secrets (`authentik.env`, real client secrets).
- MinIO stays on `9000`; Authentik HTTP on `9080`.
- YAGNI: no groups, no email/password, no Authentik in prod compose.
