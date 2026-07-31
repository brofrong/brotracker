# Torrent Search Cache + Covers Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Cache RuTracker search results in Postgres (local-first + force), store covers in MinIO, and surface source + force button + thumbnails in the frontend.

**Architecture:** `torrent.search` checks trigram matches on `torrents.title_norm` first; on miss or `force` hits RuTracker, upserts rows, returns `source`, and enqueues an in-process cover worker that uses `getImage` → MinIO → `image_key`. Frontend shows source badge, force button for local hits, and cover column.

**Tech Stack:** Bun, Drizzle ORM 1.0.0-rc (RQB v2), Postgres + `pg_trgm`, MinIO (S3 API / `@aws-sdk/client-s3`), tRPC, TanStack Query, Astryx UI.

**Design:** @docs/plans/2026-07-31-torrent-search-cache-design.md

---

### Task 1: Title normalization helper

**Files:**
- Create: `apps/backend/src/torrent/title-norm.ts`
- Create: `apps/backend/src/torrent/title-norm.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from "bun:test";
import { normalizeTitle } from "./title-norm";

describe("normalizeTitle", () => {
	test("lowercases and maps ё→е", () => {
		expect(normalizeTitle("Ёлки")).toBe("елки");
	});

	test("strips punctuation noise and collapses spaces", () => {
		expect(normalizeTitle("Матрица: Перезагрузка!!!")).toBe(
			"матрица перезагрузка",
		);
	});

	test("applies simple cyrillic↔latin lookalike map for common letters", () => {
		// keep map small: a↔а, e↔е, o↔о, p↔р, c↔с, x↔х, y↔у etc. toward cyrillic
		expect(normalizeTitle("Matrica")).toContain("м"); // or exact expected after map
	});
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun test src/torrent/title-norm.test.ts`  
Expected: FAIL (module not found)

**Step 3: Write minimal implementation**

```ts
const YO = /ё/g;
const NOISE = /[^\p{L}\p{N}\s]+/gu;
const SPACES = /\s+/g;

/** Minimal lat→cyr lookalikes for fuzzy title matching. */
const LAT_TO_CYR: Record<string, string> = {
	a: "а",
	e: "е",
	o: "о",
	p: "р",
	c: "с",
	x: "х",
	y: "у",
	h: "н",
	k: "к",
	m: "м",
	t: "т",
	b: "в",
};

export function normalizeTitle(input: string): string {
	let s = input.trim().toLowerCase().replace(YO, "е");
	s = s.replace(/[a-z]/g, (ch) => LAT_TO_CYR[ch] ?? ch);
	s = s.replace(NOISE, " ").replace(SPACES, " ").trim();
	return s;
}
```

Tune the lookalike test in Step 1 to assert the exact string you implement (e.g. `"матрица"` for `"Matrica"` if that is the mapping outcome).

**Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun test src/torrent/title-norm.test.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add apps/backend/src/torrent/title-norm.ts apps/backend/src/torrent/title-norm.test.ts
git commit -m "feat(backend): add torrent title normalization helper"
```

---

### Task 2: `torrents` schema + relations export

**Files:**
- Create: `apps/backend/src/db/torrent/torrent.schema.ts`
- Modify: `apps/backend/src/db/schema.ts`
- Modify: `apps/backend/src/db/relations.ts` (keep `defineRelations(schema, …)` over full schema)

**Step 1: Add schema**

```ts
import {
	bigint,
	integer,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";

export const torrents = pgTable("torrents", {
	torrentId: text("torrent_id").primaryKey(),
	title: text().notNull(),
	titleNorm: text("title_norm").notNull(),
	category: text().notNull(),
	forumId: text("forum_id").notNull(),
	authorId: text("author_id").notNull(),
	size: bigint({ mode: "number" }).notNull(),
	seeds: integer().notNull(),
	leeches: integer().notNull(),
	downloads: integer().notNull(),
	registeredAt: timestamp("registered_at", { withTimezone: true }).notNull(),
	torrentFileUrl: text("torrent_file_url").notNull(),
	topicUrl: text("topic_url").notNull(),
	hdr: text().$type<"HDR" | "SDR" | null>(),
	resolution: text().$type<"4K" | "1080p" | "720p" | "SD" | null>(),
	imageKey: text("image_key"),
	lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});
```

Export from `schema.ts`: `export { torrents } from "./torrent/torrent.schema";`

**Step 2: Generate migration**

Run: `cd apps/backend && bun run db:generate`  
Expected: new folder under `apps/backend/drizzle/`

**Step 3: Hand-edit migration SQL** (if kit did not emit extension/index)

Append to the new `migration.sql` (or add a follow-up SQL statement in the same migration):

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX torrents_title_norm_trgm_idx ON torrents USING gin (title_norm gin_trgm_ops);
```

**Step 4: Apply migration**

Run: `cd apps/backend && bun -e 'import { runMigrations } from "./src/db/migrate.ts"; await runMigrations();'`  
Expected: log “Database migrations applied”; `\d torrents` via psql / `db.execute` shows table + index

**Step 5: Commit**

```bash
git add apps/backend/src/db apps/backend/drizzle
git commit -m "feat(backend): add torrents table with pg_trgm index"
```

---

### Task 3: S3/MinIO client + env

**Files:**
- Modify: `apps/backend/src/utils/env.ts`
- Create: `apps/backend/src/storage/s3.ts`
- Modify: `apps/backend/.env` (local only, do not commit secrets)
- Modify: `apps/backend/package.json` — add `@aws-sdk/client-s3`
- Modify: `apps/backend/src/index.ts` — ensure bucket on startup after migrations

**Step 1: Install SDK**

Run: `cd apps/backend && bun add @aws-sdk/client-s3`

**Step 2: Extend env**

```ts
S3_ENDPOINT: z.string().default("http://localhost:9000"),
S3_ACCESS_KEY: z.string().default("minioadmin"),
S3_SECRET_KEY: z.string().default("minioadmin"),
S3_BUCKET: z.string().default("brotracker"),
S3_PUBLIC_URL: z.string().default("http://localhost:9000/brotracker"),
```

Add matching keys to `apps/backend/.env`.

**Step 3: Implement client**

```ts
// s3.ts — S3Client with forcePathStyle: true for MinIO
// ensureBucket(): HeadBucket / CreateBucket (ignore BucketAlreadyOwnedByYou)
// putCover(torrentId, bytes, contentType) → key `covers/{id}.{ext}`
// publicUrl(key) → `${env.S3_PUBLIC_URL}/${key}` (avoid double slash)
```

**Step 4: Call `ensureBucket()` from `src/index.ts` after `runMigrations()`**  
If MinIO is down, log warning and continue (search must still work).

**Step 5: Smoke**

Run: short bun script putting a tiny buffer and logging public URL.  
Expected: object visible in MinIO console at `localhost:9001`

**Step 6: Commit**

```bash
git add apps/backend/src/storage apps/backend/src/utils/env.ts apps/backend/src/index.ts apps/backend/package.json bun.lock
git commit -m "feat(backend): add MinIO S3 client and bucket bootstrap"
```

---

### Task 4: Torrent repository (local search + upsert)

**Files:**
- Create: `apps/backend/src/torrent/torrent.repository.ts`
- Create: `apps/backend/src/torrent/torrent.repository.test.ts` (optional integration; skip if no DB in CI — mark with note)

**Step 1: Constants**

```ts
export const TITLE_SIMILARITY_THRESHOLD = 0.3;
```

**Step 2: `searchLocal(queryNorm: string)`**

Use Drizzle/`db.execute` with:

```sql
SELECT *, similarity(title_norm, $1) AS score
FROM torrents
WHERE title_norm % $1
  AND similarity(title_norm, $1) >= $2
ORDER BY score DESC, seeds DESC
LIMIT 100
```

Map rows to API shape including `imageUrl` via `publicUrl(image_key)` or `null`.

**Step 3: `upsertFromTracker(results: SearchResult[])`**

`insert(torrents).values(...).onConflictDoUpdate` on `torrent_id`; set `title_norm` via `normalizeTitle`; bump `last_seen_at`; **do not clear** existing `image_key` on update.

**Step 4: Manual verify**

Insert one row, `searchLocal` with a typo’d query, confirm hit.

**Step 5: Commit**

```bash
git add apps/backend/src/torrent/torrent.repository.ts
git commit -m "feat(backend): add torrents repository with trigram search"
```

---

### Task 5: Fix `getImage` (cookies + remove debug write)

**Files:**
- Modify: `packages/rutracker-ts/src/tracker/search-engine/rutracker/get-image.ts`
- Modify: tracker wiring so `getImage` receives the same cookie/UA stack as `search` (read how `search.ts` / `http.ts` attach cookies; mirror that)
- Remove `Bun.write("response.html", …)`

**Step 1: Read search HTTP path and pass session into getImage**

**Step 2: Implement cookie-aware request** (same headers/store as search)

**Step 3: Quick manual smoke** (optional live): `getImage` for a known id returns URL string

**Step 4: Commit**

```bash
git add packages/rutracker-ts/src/tracker/search-engine/rutracker
git commit -m "fix(rutracker-ts): make getImage use session cookies"
```

---

### Task 6: Cover queue worker

**Files:**
- Create: `apps/backend/src/torrent/cover.queue.ts`

**Step 1: Implement in-process queue**

- `enqueueCoverFetch(torrentIds: string[])`
- Dedupe in-flight ids (`Set`)
- Concurrency 3
- Worker:
  1. Load row; skip if `imageKey`
  2. `tracker.getImage(id)` → remote URL
  3. `fetch` bytes (follow redirects; timeout ~15s)
  4. `putCover` → update `torrents.image_key`
  5. On error: log via `logger`, continue

**Step 2: Export enqueue; do not block callers**

**Step 3: Commit**

```bash
git add apps/backend/src/torrent/cover.queue.ts
git commit -m "feat(backend): add background cover fetch queue"
```

---

### Task 7: Wire `torrentService` + router response shape

**Files:**
- Modify: `apps/backend/src/torrent/torrent.service.ts`
- Modify: `apps/backend/src/torrent/torrent.router.ts`

**Step 1: Service API**

```ts
search(query, options, { force?: boolean }): Promise<{
  source: "local" | "tracker"
  results: Array<SearchResult & { imageUrl: string | null }>
  totalResults: number | null
}>
```

Logic:
1. If `!force`: `searchLocal`; if length > 0 → `{ source: "local", … }`
2. Else tracker `search`; on err → `{ source: "tracker", results: [], totalResults: null }`
3. On ok: `upsertFromTracker`; map `imageUrl` from DB after upsert (re-read keys or merge); `void enqueueCoverFetch(idsWithoutImage)`; `{ source: "tracker", … }`

**Step 2: Router**

- Add `force: z.boolean().optional().default(false)`
- Empty search → `{ source: "local", results: [], totalResults: null }` (stable shape — **breaking** vs old `[]`; update frontend in Task 8)
- Always return the object shape above

**Step 3: Smoke with Postgres up**

- First query unknown title → `source: "tracker"`
- Second similar query → `source: "local"`
- `force: true` → `source: "tracker"`

**Step 4: Commit**

```bash
git add apps/backend/src/torrent
git commit -m "feat(backend): local-first torrent search with force flag"
```

---

### Task 8: Frontend source badge, force button, covers

**Files:**
- Modify: `apps/frontend/src/routes/index.tsx`
- Use Astryx: `Badge` / `StatusToken` / `Button` / `Image` (or img via allowed component) — run `bunx astryx component Badge` and `bunx astryx search "image"` before coding UI
- No raw layout `<div>`; follow `apps/frontend/AGENTS.md`

**Step 1: Discover Astryx components**

Run: `cd apps/frontend && bunx astryx search "badge"` and `bunx astryx component Badge`

**Step 2: Update query typing**

- Parse `{ source, results, totalResults }` only (drop array branch)
- State or query input: `force` — e.g. `useState(false)`; SearchBar change resets `force` to false; button sets `force` true and invalidates/refetches

**Step 3: UI**

- Row above table: status text «Найдено локально» / «С трекера»
- If `source === "local"` && has results: Button «Искать на трекере»
- Table column for cover (`pixel(48)`): render thumbnail or placeholder
- Pass `imageUrl` into row model

**Step 4: Manual check in browser**

**Step 5: Commit**

```bash
git add apps/frontend/src/routes/index.tsx
git commit -m "feat(frontend): show search source, force tracker, covers"
```

---

### Task 9: End-to-end verification

**Step 1:** `docker compose -p brotracker -f docker/docker-compose.dev.yml up -d`  
**Step 2:** Backend `bun run dev` — migrations + bucket OK  
**Step 3:** Search a film → tracker → rows + later covers in MinIO  
**Step 4:** Search again / typo → local + badge + force button  
**Step 5:** Force → tracker again  

**Step 6: Final commit** only if stray fixes remain

---

## Execution handoff

Plan complete and saved to `docs/plans/2026-07-31-torrent-search-cache.md`.

**Two execution options:**

1. **Subagent-Driven (this session)** — fresh subagent per task, review between tasks  
2. **Parallel Session (separate)** — new session with executing-plans, batch with checkpoints  

Which approach?
