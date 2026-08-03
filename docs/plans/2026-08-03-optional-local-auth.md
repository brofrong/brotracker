# Optional Local Auth Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When `AUTHENTIK_CLIENT_ID` is unset, run email/password auth with one-time bootstrap registration; when set, keep Authentik OAuth unchanged.

**Architecture:** Backend resolves `authentik` vs `local` from env. Local mode enables Better Auth `emailAndPassword` and blocks sign-up after the first user via a before-hook. Public `GET /api/auth/mode` drives AuthGate / unauthorized redirect. Local UI is `/login`.

**Tech Stack:** Better Auth, Zod env, Bun tests (backend), Vitest (frontend), TanStack Router, Astryx.

**Design:** `docs/plans/2026-08-03-optional-local-auth-design.md`

**Workspace:** `.worktrees/optional-local-auth` on `feature/optional-local-auth`

---

### Task 1: Auth mode helpers + env schema

**Files:**
- Create: `apps/backend/src/auth/auth-mode.ts`
- Create: `apps/backend/src/auth/auth-mode.test.ts`
- Create: `apps/backend/src/utils/env.test.ts` (or extend if exists)
- Modify: `apps/backend/src/utils/env.ts`

**Step 1: Failing tests for mode resolution**

```ts
// auth-mode.test.ts
import { describe, expect, test } from "bun:test";
import { resolveAuthMode } from "./auth-mode";

describe("resolveAuthMode", () => {
  test("empty / whitespace / undefined → local", () => {
    expect(resolveAuthMode({ AUTHENTIK_CLIENT_ID: undefined })).toBe("local");
    expect(resolveAuthMode({ AUTHENTIK_CLIENT_ID: "" })).toBe("local");
    expect(resolveAuthMode({ AUTHENTIK_CLIENT_ID: "  " })).toBe("local");
  });
  test("non-empty → authentik", () => {
    expect(resolveAuthMode({ AUTHENTIK_CLIENT_ID: "cid" })).toBe("authentik");
  });
});
```

Env tests: parse without Authentik → local fields optional; with ID+secret OK; ID without secret throws.

**Step 2: Implement**

`resolveAuthMode`: trim ID; empty → `"local"` else `"authentik"`.

Env: make `AUTHENTIK_CLIENT_ID` / `AUTHENTIK_CLIENT_SECRET` optional; `superRefine` — if trimmed ID set, secret required `min(1)`.

Export `authMode` from env or auth-mode using parsed env.

**Step 3: Commit** `feat(auth): resolve local vs authentik mode from env`

---

### Task 2: registrationOpen + mode HTTP handler

**Files:**
- Modify: `apps/backend/src/auth/auth-mode.ts`
- Create: `apps/backend/src/auth/auth-mode-http.ts` (or keep in auth-mode)
- Modify: `apps/backend/src/auth/auth-mode.test.ts`
- Modify: `apps/backend/src/index.ts`

**Step 1: Tests**

- `isRegistrationOpen(countUsers)` / `buildAuthModeResponse({ mode, userCount })` → `{ mode, registrationOpen }`
- `registrationOpen` true only when `mode === "local"` and `userCount === 0`

**Step 2: Implement**

```ts
export function buildAuthModeResponse(input: {
  mode: "local" | "authentik";
  userCount: number;
}) {
  return {
    mode: input.mode,
    registrationOpen: input.mode === "local" && input.userCount === 0,
  };
}
```

`countUsers`: `db.select({ c: count() }).from(user)` 

In `index.ts` middleware, before `authHandler`:

```ts
if (url.split("?")[0] === "/api/auth/mode" && req.method === "GET") {
  // write JSON via buildAuthModeResponse
  return;
}
```

**Step 3: Commit** `feat(auth): expose GET /api/auth/mode`

---

### Task 3: Conditional Better Auth + signup gate

**Files:**
- Modify: `apps/backend/src/auth/auth.ts`
- Create: `apps/backend/src/auth/local-signup-gate.test.ts`

**Step 1: Test pure gate helper**

```ts
export function assertLocalSignUpAllowed(userCount: number): void {
  if (userCount > 0) throw ... // or return error shape
}
```

**Step 2: Implement `createAuth`**

- If authentik: current `genericOAuth` only
- If local: `emailAndPassword: { enabled: true }`, no OAuth plugin
- Local hooks.before on `/sign-up/email`: count users; if > 0 throw `APIError("FORBIDDEN", { message: "Registration is closed" })`

**Step 3: Commit** `feat(auth): enable email/password with bootstrap-only signup`

---

### Task 4: Docker / env examples

**Files:**
- Modify: `docker/.env.example`
- Modify: `docker/docker-compose.yml`
- Modify: `apps/backend/.env.example`
- Modify: `docker/AUTHENTIK.md` if it claims Authentik is required

Remove `change-me` defaults; comment Authentik vars as optional. Compose: only pass Authentik env when set, or pass empty defaults.

**Commit:** `chore(docker): make Authentik env optional for local auth`

---

### Task 5: Frontend auth client + redirect policy

**Files:**
- Modify: `apps/frontend/src/utils/auth-client.ts`
- Modify: `apps/frontend/src/utils/unauthorized-redirect.ts`
- Modify: `apps/frontend/src/utils/unauthorized-redirect.test.ts`
- Create: `apps/frontend/src/utils/auth-mode.ts` (fetch mode)

**Behavior:**
- `fetchAuthMode()` → GET `{base}/api/auth/mode`
- `redirectToSignIn()`: if authentik → oauth; if local → `window.location.assign("/login")` (or router navigate)
- `signOutAndRedirect`: signOut then `redirectToSignIn`

Update default unauthorized redirect to use `redirectToSignIn`.

**Commit:** `feat(frontend): route unauth users by auth mode`

---

### Task 6: AuthGate + `/login` page

**Files:**
- Modify: `apps/frontend/src/components/AuthGate.tsx`
- Create: `apps/frontend/src/routes/login.tsx`
- Modify: `apps/frontend/src/routes/__root.tsx` if AuthGate must skip `/login`

**AuthGate:** if path is `/login`, render children without session check (or login route outside gate). Prefer: `__root` wraps AuthGate only for non-login; or AuthGate early-returns for `/login`.

**Login page (Astryx):** Center + form. If `registrationOpen` → signUp fields; else signIn. On success → navigate `/`. Use `bunx astryx` for Form/Input/Button.

**Commit:** `feat(frontend): add local login and bootstrap registration page`

---

### Task 7: Verify

Run:
- `cd apps/backend && bun test src/auth src/utils/env.test.ts`
- `cd apps/frontend && bun run test` (or vitest for unauthorized-redirect)

Fix failures. Final commit if needed.

---

### Execution note

Implement in worktree `.worktrees/optional-local-auth`. Do not touch unrelated dirty files on main (Dockerfile port changes).
