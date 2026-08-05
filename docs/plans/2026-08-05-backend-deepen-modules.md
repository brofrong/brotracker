# Backend deepen modules — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restore the backend import DAG and deep-module locality: Catalog owns search types, Title stops re-implementing tracker search, Watch lives behind its own small interface under `title/watch/`, Home stops importing Title repositories.

**Architecture:** Keep ADR 0001 layers (routers → cores → adapters → infra). Prefer one PR per seam so each merge stays reviewable. Collapse over-partitioned ports when grouping Watch; do not invent new ports unless a second adapter exists. Tests stay at the module interface (`createX`), not past it.

**Tech Stack:** Bun, tRPC, Drizzle, existing `createX(deps)` pattern, `bun test`.

**Out of scope (later PRs):** `qbittorent` → `qbittorrent` rename (breaking tRPC key), `createTransfers` / full qb feature reshape, ESLint DAG rule, multi-package split.

**Related:** `CONTEXT.md`, `docs/adr/0001-module-boundaries.md`, Phase C items 3–4 in `docs/plans/2026-08-05-architecture-rules-design.md`.

---

## PR map (do in order)

| PR | Slice | Risk | Why first/next |
|---|---|---|---|
| 1 | Type seam: `LocalCatalogHit` ownership | Low | Unblocks Catalog evolution; no behaviour change |
| 2 | Infra: `proxy-agent` → `http/` | Low | Fixes upward import; touches few call sites |
| 3 | Home DAG: watch feed + TMDB via ports / shared adapter | Medium | Stops Home → Title implementation imports |
| 4 | Title search through Catalog | Medium | Deletes duplicate tracker path; real leverage |
| 5 | `title/watch/` + `createWatch` | High | Biggest locality win; largest move |

Each PR ends with: `bun test` in `apps/backend`, commit, mergeable alone.

---

### Task 1: Move `LocalCatalogHit` to the data owner

**Files:**
- Create: `apps/backend/src/torrent/torrent.types.ts` (or `cached-torrent.ts` — pick one name, prefer `torrent.types.ts`)
- Modify: `apps/backend/src/torrent/torrent.repository.ts`
- Modify: `apps/backend/src/catalog/catalog.ts`
- Modify: any re-exports that expose `LocalCatalogHit` from Catalog
- Test: `apps/backend/src/catalog/catalog.test.ts` (update imports only)

**Step 1: Define the hit type next to the repository**

In `torrent.types.ts`:

```ts
import type { SearchResult } from "@brotracker/rutracker-ts/tracker/tracker-interface";

/** Cached tracker hit as stored / returned by the torrent repository. */
export type LocalCatalogHit = SearchResult & {
	imageKey: string | null;
};
```

Keep the name `LocalCatalogHit` for now (Catalog callers already use it). Optional rename to `CachedTorrentHit` in a later vocabulary pass — not this PR.

**Step 2: Point repository at the new type**

- Remove `import type { LocalCatalogHit } from "../catalog/catalog"` from `torrent.repository.ts`
- Import from `./torrent.types`
- Re-export `LocalCatalogHit` from `torrent.repository.ts` if other files import it from there today (grep first)

**Step 3: Catalog imports the type from the adapter**

In `catalog.ts`:

```ts
import type { LocalCatalogHit } from "../torrent/torrent.types";
// remove local `export type LocalCatalogHit = ...`
```

Re-export for convenience only if public Catalog API currently exports it:

```ts
export type { LocalCatalogHit } from "../torrent/torrent.types";
```

Prefer **not** re-exporting long-term; update call sites to import from `torrent.types` or repository. For this PR, a re-export is OK to keep the diff small.

**Step 4: Verify**

```bash
cd apps/backend && bun test
```

Expected: all pass. Confirm with ripgrep: no `from "../catalog/catalog"` (or similar) inside `torrent.repository.ts`.

**Step 5: Commit**

```bash
git add apps/backend/src/torrent/torrent.types.ts \
  apps/backend/src/torrent/torrent.repository.ts \
  apps/backend/src/catalog/catalog.ts
git commit -m "$(cat <<'EOF'
fix(backend): move LocalCatalogHit to torrent adapter types

Repository must not import Catalog for hit shape — types stay with the data owner.
EOF
)"
```

---

### Task 2: Lift `proxy-agent` into `http/`

**Files:**
- Move: `apps/backend/src/torrent/proxy-agent.ts` → `apps/backend/src/http/proxy-agent.ts`
- Modify: `apps/backend/src/http/fetch-with-proxy.ts`
- Modify: `apps/backend/src/torrent/torrent.tracker.ts`
- Grep: any other `proxy-agent` imports

**Step 1: Move file and fix imports**

- `fetch-with-proxy.ts`: `from "./proxy-agent"`
- `torrent.tracker.ts`: `from "../http/proxy-agent"`
- Delete old `torrent/proxy-agent.ts`

**Step 2: Verify**

```bash
cd apps/backend && bun test
```

**Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
refactor(backend): move proxy-agent under http/

Infra helpers must not live under feature/adapter folders.
EOF
)"
```

---

### Task 3: Home stops importing Title implementations

**Problem today**
- `home/index.ts` imports `listRecentWatchEvents` from `../title/title-watch-event.repository`
- `home/tmdb-discover.ts` imports `createTmdbBrowse` / `mapBrowseItem` from `../title/tmdb-browse`
- `home/home.ts` imports event types from `../title/title-watch-event`

**Target**
- Home only sees ports on `HomeDeps` (already mostly true for events)
- Wire `getTitleWatchEvents` from **app composition** or a thin re-export owned by Title’s public surface — not from Home importing a repository
- TMDB browse: either (A) move shared TMDB client helpers to `apps/backend/src/tmdb/` (adapter), or (B) inject `fetchDiscoverFeed` fully from Title/`index` composition without Home importing Title files

**Recommended approach: B for feed wiring + A-lite for browse**

Prefer minimal churn:
1. Keep event **types** in `title/title-watch-event.ts` for this PR (type-only import is the milder smell); document as follow-up to extract a read-model DTO if Home needs independence.
2. Stop Home `index.ts` from importing the repository: export a bound function from `title/index.ts` (e.g. `listTitleWatchFeed(limit)`) and import **that** from Home — still a cross-feature import, but of Title’s composition surface, not persistence. Better: wire in `apps/backend/src/index.ts` if Home is constructed there later; for now Title public export is acceptable.
3. For discover: extract `tmdb-browse.ts` (+ parsers used by both) to `apps/backend/src/tmdb/browse.ts` (adapter). Title and Home both import from `tmdb/`, not from each other.

**Files:**
- Create: `apps/backend/src/tmdb/browse.ts` (move from `title/tmdb-browse.ts`; keep tests as `tmdb/browse.test.ts`)
- Modify: `apps/backend/src/title/index.ts` — import browse from `../tmdb/browse`; export `getTitleWatchFeed` helper wrapping `listRecentWatchEvents`
- Modify: `apps/backend/src/home/index.ts` — use Title public helper or inject; remove repository import
- Modify: `apps/backend/src/home/tmdb-discover.ts` — import from `../tmdb/browse`
- Update: `title/tmdb-browse.test.ts` path / imports
- Update ADR note in PR description if needed (optional one-liner in 0001 “Home may consume via Title composition export or ports”)

**Step 1: Move TMDB browse to adapter folder**

- Preserve `createTmdbBrowse` interface
- Fix Title + Home imports
- Run `bun test` for browse + home + title tests

**Step 2: Export feed reader from Title composition**

In `title/index.ts`:

```ts
export function getTitleWatchFeed(limit: number) {
  return listRecentWatchEvents(limit);
}
```

In `home/index.ts`:

```ts
import { getTitleWatchFeed } from "../title";
// ...
getTitleWatchEvents: () => getTitleWatchFeed(TITLE_WATCH_FEED_LIMIT),
```

Remove `title-watch-event.repository` import from Home.

**Step 3: Verify**

```bash
cd apps/backend && bun test
rg "title-watch-event.repository" apps/backend/src/home
```

Expected: no matches under `home/`.

**Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
refactor(backend): decouple Home from Title repositories

Home consumes watch feed via Title composition; TMDB browse lives under tmdb/.
EOF
)"
```

---

### Task 4: Title torrents search goes through Catalog

**Problem today**
- `title/index.ts` duplicates tracker search + `upsertFromTracker` (`searchTrackerForTitle`, `searchLocalForTitle`)
- Catalog already owns local/tracker/upsert/cover orchestration

**Target**
- Add a Catalog method (or narrow port) that Title can call for “candidates for this title query”
- TitleDeps collapses `searchLocal` + `searchTracker` into one port, e.g. `searchTorrents(query): Promise<TitleTorrentsSearch>` — **or** keep two ports but both wired from Catalog, not from raw tracker

**Recommended interface (pick one and stick to it)**

Prefer **one port** on Title:

```ts
searchTorrents: (query: string) => Promise<
  | { status: "ok"; local: TitleTorrentCandidate[]; tracker: TitleTorrentCandidate[] }
  | { status: "degraded"; local: TitleTorrentCandidate[]; trackerError: "unavailable" | "error" }
>;
```

Wire in `title/index.ts` by calling `catalog.search` + `catalog.searchRefresh` (or whatever the live API is — read `catalog.ts` before implementing; do not invent a third search path).

Map `CatalogSearchResult` → `TitleTorrentCandidate` in the composition layer only.

**Files:**
- Modify: `apps/backend/src/catalog/catalog.ts` — only if Title needs a method Catalog lacks (prefer reuse `search` + `searchRefresh`)
- Modify: `apps/backend/src/title/title.types.ts` — shrink deps
- Modify: `apps/backend/src/title/title.ts` — call the new/combined port
- Modify: `apps/backend/src/title/index.ts` — delete `searchLocalForTitle` / `searchTrackerForTitle`; wire via `catalog`
- Modify: `apps/backend/src/title/title-torrents.test.ts` / `title.test.ts` — fake the combined port
- Avoid: catalog importing title types

**Step 1: Write failing test for Title torrents using combined port**

Update `title-torrents.test.ts` so deps provide `searchTorrents` (or Catalog-backed fakes), not separate local/tracker stubs that mirror the old shape — unless keeping two ports temporarily.

**Step 2: Implement wiring through Catalog**

- Import `catalog` from `../catalog` **only in `title/index.ts`** (composition), never in `title.ts` core
- Core stays free of Catalog imports

**Step 3: Delete duplicate tracker helpers from `title/index.ts`**

Confirm no other callers of the deleted helpers.

**Step 4: Verify**

```bash
cd apps/backend && bun test
```

**Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
refactor(backend): route Title torrent search through Catalog

Remove duplicate tracker search/upsert from title composition.
EOF
)"
```

---

### Task 5: Extract `title/watch/` + `createWatch`

**Goal:** Watch pipeline behind a small deep module; Title’s `get` becomes read-only w.r.t. qb sync.

**Move under `apps/backend/src/title/watch/` (keep tests next to files):**

| From `title/` | To `title/watch/` |
|---|---|
| `check-topic-now.ts` (+ test) | same names |
| `process-watch-task.ts` (+ test) | |
| `enqueue-nightly-tasks.ts` (+ test) | |
| `nightly-worker.ts` (+ test) | |
| `sync-watches-from-qb.ts` (+ test) | |
| `replace-torrent-in-qb.ts` (+ test) | |
| `title-watch.repository.ts` | `watch.repository.ts` or keep name |
| `title-watch-event.ts` (+ test) | |
| `title-watch-event.repository.ts` | |
| `watch-task.repository.ts` | |
| `episode-progress.ts` (+ test) | if only used by watch; else stay at title root |
| `torrent-fingerprint.ts` (+ test) | if watch-only |

Leave at `title/` root: `title.ts`, `title.types.ts`, `title.router.ts`, `index.ts`, `tmdb-meta.ts`, topic-tag helpers used by Title UI path, ratings (or delete ratings port if still single-adapter — optional cleanup in this PR).

**New files:**
- `apps/backend/src/title/watch/watch.ts` — `createWatch(deps)`
- `apps/backend/src/title/watch/watch.types.ts` — ports + public types
- `apps/backend/src/title/watch/index.ts` — composition (nightly worker, processTask, sync) — **thin**
- `apps/backend/src/title/watch/README.md` — short map: who calls what (ADR asks for this)

**Suggested `createWatch` interface (keep small):**

```ts
export type Watch = {
  /** Explicit sync from qb tags/paths — not called from Title.get */
  syncFromQb: () => Promise<void>;
  setWatch: (input: /* existing */) => Promise<void>;
  checkNow: (input: { topicUrl: string; titleId: string | null }) => Promise</* */>;
  /** Used by worker + manual drain */
  processTask: (taskId: string) => Promise<ProcessWatchTaskResult>;
};

export type WatchDeps = {
  // group related ports — avoid 19 flat fns:
  store: {
    loadByTopicUrl: ...
    loadByTitleId: ...
    save: ...
    listTracking: ...
    appendEvent: ...
    createTask: ...
    loadTask: ...
    saveTask: ...
    hasPending: ...
    listPendingIds: ...
  };
  transfers: {
    listQbTorrents: ...
    replaceInQb: ...
    getSeriesPath: ...
  };
  tracker: {
    fetchTorrentBytes: ...
    fetchTopicMeta: ...
  };
  isCompletePack: (name: string) => boolean;
  now: () => string;
};
```

Tune to existing function signatures; do not change DB schema in this PR.

**Title changes:**
- `TitleDeps` drops watch-task/process/replace/listQb/fetchBytes/etc. if only Watch needs them
- Title may depend on a narrow `WatchViewPort`: `loadWatchByTitleId` / `loadWatchByTopicUrl` for read model only
- **`get()` must not call `syncWatchesFromQb`** — move sync to nightly worker only (already runs there) + optional explicit `watch.syncFromQb` if UI needs a button later
- `setWatch` / `checkNow` on Title module either delegate to `Watch` or move to watch router procedures — prefer Title router still exposes same tRPC API by calling `watch.*` so FE does not break

**Composition:**
- `title/watch/index.ts` wires repos + qb + tracker (logic moved out of mega `title/index.ts`)
- `title/index.ts` shrinks: Title module + re-export `nightlyWorker` from watch
- App `index.ts` keeps importing `nightlyWorker` from title public surface

**Step 1: Move files with git mv, fix imports, keep behaviour identical**

No interface change yet — pure relocate. Commit: `refactor(backend): move watch pipeline under title/watch/`.

**Step 2: Introduce `createWatch` wrapping existing functions**

Behaviour-preserving façade; Title still syncs on get temporarily if needed. Commit: `refactor(backend): add createWatch module`.

**Step 3: Make `get()` read-only; sync only via worker / `syncFromQb`**

Update `title-watch.test.ts` / `title.test.ts` expecting no sync-on-read. If FE relied on sync-on-open, document that nightly + add/setWatch paths cover it; add explicit sync call only if a test/UI proves need.

**Step 4: Collapse TitleDeps; thin `title/index.ts`**

Target: `title/index.ts` ≪ 150 lines; watch composition owns the rest.

**Step 5: README map + verify**

```bash
cd apps/backend && bun test
```

**Step 6: Commit**

```bash
git commit -m "$(cat <<'EOF'
refactor(backend): extract createWatch under title/watch/

Watch pipeline gets its own deep module; Title get() no longer syncs from qb.
EOF
)"
```

---

## Verification checklist (every PR)

- [ ] `cd apps/backend && bun test` green
- [ ] No new feature-core → other-feature-implementation imports (`rg` the touched paths)
- [ ] Routers stay thin (no new business logic in `*.router.ts`)
- [ ] Vocabulary: Transfer vs Torrent, WatchTask, TitleWatch — don’t introduce “follow” in new code
- [ ] Update `docs/adr/0001` or Phase C checkboxes only when a slice lands (optional small docs commit)

---

## Done when

1. `torrent.repository` does not import Catalog  
2. `proxy-agent` lives under `http/`  
3. `home/` does not import Title `*.repository`  
4. Title does not duplicate tracker search/upsert  
5. `title/watch/` exists with `createWatch` + README; `get()` is read-only w.r.t. qb sync  
6. Phase C items 3–4 in architecture-rules plan can be checked off  

## Follow-ups (not this plan)

- Rename `qbittorent` → `qbittorrent`  
- `createTransfers` wrapping qb client  
- Drop `ratings-port` until second rating source exists  
- Move quality-score to shared domain util if both Catalog and Title cores need it without importing `torrent/`  
- Home type-only dependency on `title-watch-event` → shared read-model type  
