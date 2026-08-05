# Transfer speed stats — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or implement in-session with TDD).

**Goal:** Stats page at `/stats` with daily min/avg/max Transfer speeds (active samples only) over presets + custom range.

**Architecture:** Daily rollup table updated on each speed sample; `home.speedHistory` fills day range; FE feature `stats` with Recharts + DateRangeInput.

**Tech Stack:** Bun, Drizzle/Postgres, tRPC, React, Recharts, Astryx.

---

### Task 1: Pure rollup + history range (TDD)

**Files:**
- Create: `apps/backend/src/home/daily-speed-stats.ts`
- Create: `apps/backend/src/home/daily-speed-stats.test.ts`

Functions: `applyActiveSpeedSample`, `dayStatsToApi`, `buildSpeedHistoryDays`.

### Task 2: Schema + migration

**Files:**
- Create: `apps/backend/src/db/transfer/transfer-daily-speed-stats.schema.ts`
- Modify: `apps/backend/src/db/schema.ts`
- Generate drizzle migration

### Task 3: Persist + query + wire scheduler

**Files:**
- Modify: `apps/backend/src/home/transfer-history.ts` — upsert rollup, `getSpeedHistory`, backfill
- Modify: `apps/backend/src/home/home.router.ts` — `speedHistory` procedure
- Modify: `apps/backend/src/home/index.ts` if needed

### Task 4: Frontend page + nav + i18n

**Files:**
- Create: `apps/frontend/src/features/stats/stats-page.tsx`
- Create: `apps/frontend/src/routes/stats.tsx`
- Modify: nav, locales, i18n namespaces, routeTree (regen)

### Task 5: Release note + verify

- `changes/unreleased/...-transfer-speed-stats.md`
- `bun test` backend; typecheck FE if available
