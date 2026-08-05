# Kinozal tracker + multi-source Catalog — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or subagent-driven-development.

**Goal:** Add Kinozal.me as a second tracker Provider with full RuTracker parity, namespaced torrent ids, and settings-enabled multi-source Catalog search.

**Architecture:** Kinozal adapter beside RuTracker in `packages/rutracker-ts`; `torrentId` = `rutracker:<id>` | `kinozal:<id>`; Catalog fans out to enabled Providers; download/cover/TitleWatch route by prefix.

**Tech Stack:** Bun, neverthrow, axios, node-html-parser, iconv-lite, Drizzle/Postgres, tRPC, React.

**Design:** `docs/plans/2026-08-05-kinozal-tracker-design.md`

**Verified live (do not commit secrets):**
- Login `POST /takelogin.php` → cookies `uid`, `pass` on `.kinozal.me`
- Search `GET /browse.php?s=…&c=…`
- Topic `GET /details.php?id=`
- Download `https://dl.kinozal.me/download.php?id=` (`application/x-bittorrent`)
- Encoding windows-1251; Cloudflare present

**Fixtures (already in tree):**
- `packages/rutracker-ts/test/fixtures/html/kinozal/browse-matrix.html`
- `packages/rutracker-ts/test/fixtures/html/kinozal/details-guest.html`
- `packages/rutracker-ts/test/fixtures/html/kinozal/details-authed.html`
- `packages/rutracker-ts/test/fixtures/html/kinozal/details-authed-minimal.html`

**Working directory:** `/Users/dmitiigorshkov/pet/brotracker/.worktrees/kinozal-tracker`  
**Branch:** `feature/kinozal-tracker`

---

### Task 1: Torrent id helpers (TDD)

**Files:**
- Create: `packages/rutracker-ts/src/tracker/torrent-id.ts`
- Create: `packages/rutracker-ts/test/unit/torrent-id.test.ts`
- Modify: `packages/rutracker-ts/src/index.ts` (re-export)

**API:**
```ts
type TrackerSource = "rutracker" | "kinozal";
formatTorrentId(source, rawId): string  // "rutracker:123"
parseTorrentId(id): { source: TrackerSource; rawId: string }
// bare digits → { source: "rutracker", rawId }
```

**Steps:** failing tests → implement → pass → commit `feat(trackers): add namespaced torrent id helpers`

---

### Task 2: RuTracker emits namespaced ids

**Files:**
- Modify: `packages/rutracker-ts/src/tracker/search-engine/rutracker/parse.ts` — `torrentId: formatTorrentId("rutracker", id)`
- Modify: `packages/rutracker-ts/src/tracker/search-engine/rutracker/get-image.ts` — accept namespaced or raw; strip via `parseTorrentId`
- Modify unit parse/media-type/get-image tests + fixtures expectations

**Steps:** update tests expecting prefixed ids → fix parse/getImage → pass → commit `feat(rutracker): namespace torrent ids`

---

### Task 3: Kinozal parse (TDD)

**Files:**
- Create: `packages/rutracker-ts/src/tracker/search-engine/kinozal/constants.ts` — `KINOZAL_URL`, `KINOZAL_DL_URL`
- Create: `packages/rutracker-ts/src/tracker/search-engine/kinozal/format.ts` (size/date; reuse HDR/resolution from rutracker/format or shared)
- Create: `packages/rutracker-ts/src/tracker/search-engine/kinozal/parse.ts`
- Create: `packages/rutracker-ts/src/tracker/search-engine/kinozal/media-type.ts`
- Create: `packages/rutracker-ts/test/unit/kinozal-parse.test.ts`

**Parse rules:**
- Rows: `table.t_peer tr` with `a[href*="details.php?id="]`
- Cells: comments, size, seeds (`sl_s`), peers (`sl_p`), date, author (`userdetails.php?id=`)
- Category from `img[onclick^=cat(]` or `/pic/cat/N.gif`
- `torrentId` = `kinozal:<id>`
- `topicUrl` = `https://kinozal.me/details.php?id=`
- `torrentFileUrl` = `https://dl.kinozal.me/download.php?id=`
- Total: regex like `Найдено\s+([\d\s]+)\s+раздач`

**Steps:** failing parse test on fixture → implement → pass → commit `feat(kinozal): parse browse results`

---

### Task 4: Kinozal login / http / search / getTorrent / getImage

**Files:**
- Create: `kinozal/http.ts` (reuse CF helpers from rutracker/http + cf if possible via import)
- Create: `kinozal/login.ts` — session valid if `uid`+`pass` cookies; POST takelogin; optional CF
- Create: `kinozal/search.ts` — browse.php + windows-1251
- Create: `kinozal/search-options.ts` — `c=1002` films, `c=1001` tv
- Create: `kinozal/get-torrent.ts` — allowlist dl.kinozal.me/download.php
- Create: `kinozal/get-image.ts` — details.php poster `/i/poster/` prefer, else first imgbox
- Create: `kinozal/index.ts` — `createKinozal`
- Create: unit tests for get-image parse + get-torrent payload check
- Optional: integration live test skipped without env `KINOZAL_USERNAME`/`KINOZAL_PASSWORD`

**Steps:** implement + unit tests → commit `feat(kinozal): login search download image`

---

### Task 5: Register tracker + generalize options

**Files:**
- Modify: `tracker-interface.ts` — `Tracker = "Rutracker" | "Kinozal"`; rename options to shared `TrackerAuthOptions` (or alias `KinozalOptions = RutrackerOptions`)
- Modify: `tracker.ts` — register `Kinozal: createKinozal`
- Export from package index

**Steps:** compile/tests → commit `feat(trackers): register Kinozal factory`

---

### Task 6: DB identity migration + kinozal_store

**Files:**
- Create: `apps/backend/src/db/kinozal-store/kinozal-store.schema.ts`
- Modify: `apps/backend/src/db/schema.ts`
- Migration SQL:
  - create `kinozal_store`
  - `UPDATE torrents SET torrent_id = 'rutracker:' || torrent_id WHERE torrent_id !~ '^(rutracker|kinozal):'`
  - same for `image_key` if it embeds id (`covers/` || …)
- Create: `apps/backend/src/torrent/kinozal-db-store.ts`
- Create: `apps/backend/src/torrent/torrent-id.ts` wrappers or import from package
- Update topic-tag helpers for namespaced ids + legacy bare digits

**Steps:** generate drizzle migration → unit tests for topic-tag → commit `feat(db): namespace torrent ids and add kinozal store`

---

### Task 7: Multi-provider settings

**Files:**
- Create: `apps/backend/src/settings/kinozal-config.ts` (mirror rutracker + `enabled`)
- Modify: `rutracker-config` / provider schema types — add `enabled?: boolean` (default true for rutracker back-compat)
- Modify: `provider-config.ts`, `provider-settings.schema.ts`, `settings.router.ts`
- FE: settings forms + i18n + section `kinozal`

**Steps:** backend tests for save/keep password/enabled → FE form → commit `feat(settings): Kinozal provider and enabled toggles`

---

### Task 8: Catalog fan-out + tracker clients

**Files:**
- Modify: `torrent.tracker.ts` — `getTracker(source)`, `getEnabledTrackers()`, invalidate per-source
- Modify: `catalog/index.ts` + `catalog.ts` — parallel search, merge, partial success
- Modify: `cover.queue.ts`, `add-from-tracker.ts` — route by id + allowlist `https://dl.kinozal.me/download.php?id=\d+`
- TitleWatch paths that call `getTracker()` / search

**Steps:** catalog tests for merge/partial → commit `feat(catalog): multi-tracker search fan-out`

---

### Task 9: FE source badge + Title/search wiring

**Files:**
- Search/title UI: badge from `parseTorrentId`
- Replace RuTracker-only URL assumptions
- i18n

**Steps:** visual/typecheck → commit `feat(ui): show tracker source on results`

---

### Task 10: Docs + release note + verify

**Files:**
- `CONTEXT.md`, short ADR `docs/adr/0003-multi-tracker.md` (or next number)
- `changes/unreleased/YYYYMMDD-HHMMSS-kinozal-tracker.md`
- Run: `bun test` in package + backend; fix failures

**Steps:** commit docs/note → final verification

---

## Execution notes

- Never commit `brofrong` / password / live cookies.
- Prefer importing shared CF/http from rutracker module over copy-paste where DAG allows.
- Legacy qB tag compat: match `brotracker:topic:{digits}` as rutracker.
- After Task 8–9, live-smoke with env creds only locally.
