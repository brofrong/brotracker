# Search cache + covers design

Date: 2026-07-31  
Status: approved

## Goal

Cache RuTracker search results in local Postgres and serve them first. Persist torrent covers in MinIO. Let the user force a live tracker search when results came from the local DB. Use trigram + title normalization for fuzzy local matching.

## Decisions

| Topic | Choice |
|--------|--------|
| Cache hit policy | Strict local-first: any local matches → return only DB; tracker only on miss or force |
| Force search | Return tracker results only (no merge with local rows for that response) |
| Cover fetch | Background after response; prefer MinIO URL when already stored |
| Local search | `pg_trgm` on normalized `title_norm` (+ light translit/normalization) |
| Cover refresh API | Not in v1 (re-search / reload picks up new `imageUrl`) |

## Request flow

### Normal search (`force` false / omitted)

1. Normalize query → `query_norm` (lower, ё→е, strip punctuation noise, simple lat↔cyr where useful).
2. Query `torrents` with `pg_trgm` similarity on `title_norm`, filter by threshold, order by score then seeds.
3. **Hits (≥1):** respond `{ source: "local", results, totalResults }`.  
   `imageUrl` = public MinIO URL if `image_key` set, else `null`.
4. **Miss:** call RuTracker → upsert rows → respond `{ source: "tracker", results, totalResults }` → enqueue background cover jobs for rows without `image_key`.

### Force search (`force: true`)

Skip local lookup. Same as tracker path above. Always `source: "tracker"`.

Empty `search` → empty results (unchanged).

## Data model

### Table `torrents`

| Column | Type | Notes |
|--------|------|--------|
| `torrent_id` | text PK | RuTracker topic id |
| `title` | text | Original title |
| `title_norm` | text | Normalized for search |
| `category` | text | |
| `forum_id` | text | |
| `author_id` | text | |
| `size` | bigint | bytes |
| `seeds` / `leeches` / `downloads` | int | |
| `registered_at` | timestamptz | tracker date |
| `torrent_file_url` | text | |
| `topic_url` | text | |
| `hdr` | text null | `HDR` / `SDR` |
| `resolution` | text null | `4K` / `1080p` / … |
| `image_key` | text null | MinIO object key, e.g. `covers/{torrent_id}.jpg` |
| `last_seen_at` | timestamptz | bumped on upsert |

- Extension: `CREATE EXTENSION IF NOT EXISTS pg_trgm`
- Index: GIN trigram on `title_norm`
- Upsert on `torrent_id` when ingesting tracker results
- Drizzle RQB v2 (`defineRelations`); no relations required for v1

### MinIO / S3

- Bucket: `brotracker` (ensure on startup)
- Object key: `covers/{torrent_id}.<ext>`
- Env: `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `S3_PUBLIC_URL`
- Dev: public read on bucket; API returns absolute `imageUrl` from `S3_PUBLIC_URL` + key

## API

Extend `torrent.search`:

```ts
input: {
  search?: string
  force?: boolean
  options?: { category?, sortType?, sortOrder? }
}

output: {
  source: "local" | "tracker"
  results: Array<
    /* existing SearchResult fields */ & {
      imageUrl: string | null
    }
  >
  totalResults: number | null
}
```

Tracker errors on miss/force: keep current soft-fail style (empty results + log). Cover failures never fail the search response.

## Background covers

In-process queue on the backend (no Redis in v1):

- After tracker response: `enqueueCoverFetch(torrentIds)`
- Worker concurrency ~3
- Per id: skip if `image_key` present → `tracker.getImage(id)` → download bytes → put MinIO → update `image_key`
- Idempotent; safe if server restarts (missing covers retry on next tracker ingest)

## Frontend (`/`)

- Badge / status: «Найдено локально» vs «С трекера» from `source`
- When `source === "local"`: button «Искать на трекере» → same query with `force: true`
- Thumbnail column; placeholder when `imageUrl` is null
- Keep dense Table (no Card-wrapped rows); Astryx components only

## Error / resilience

| Failure | Behavior |
|---------|----------|
| Postgres down | App should not start (migrate/connect fail) |
| MinIO down | Search works; `imageUrl` stays null |
| Single cover fetch fail | Log; leave `image_key` null |
| RuTracker fail on miss/force | Empty results + log |

## Out of scope (v1)

- Merging local + tracker rows in one response
- Live websocket/poll for cover updates
- Elasticsearch / external search engine
- Query-history table (matching is by torrent title, not by past query strings)
- Auth-gated search

## Implementation notes

- Wire existing `rutracker-ts` `getImage`; fix session/CF cookies if needed for topic pages
- Similarity threshold: start tunable constant (e.g. `0.3`), adjust after real queries
- Normalization shared between write path (upsert) and read path (query)
