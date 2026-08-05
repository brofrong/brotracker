# Kinozal tracker + multi-source Catalog

Date: 2026-08-05  
Status: approved

## Goal

Add [Kinozal.me](https://kinozal.me/) as a second torrent Provider with full parity to RuTracker (settings, search, `.torrent` download, covers, TitleWatch/workers), and let the user enable multiple tracker sources in settings so Catalog search hits all enabled ones.

## Decisions

| Topic | Choice |
|--------|--------|
| Search sources | Multi-select in **settings** (`enabled` per tracker); search always uses enabled sources |
| Scope (v1) | Full parity: settings + search + download + covers + TitleWatch/workers |
| Package layout | New adapter under `packages/rutracker-ts/.../search-engine/kinozal/` (rename package later) |
| Identity | Namespaced `torrentId`: `rutracker:<id>` / `kinozal:<id>` |
| Legacy IDs | Bare digits treated as `rutracker`; one-shot DB migration prefixes existing rows |
| Partial failure | Merge successful trackers; log errors; throw only if all fail / unavailable |
| Session storage | Separate cookie store per tracker (`rutracker_store` + `kinozal_store`) |
| CF solver | Shared `BYPARR_URL`; use when Kinozal returns CF challenge |
| Passwords at rest | Unchanged (plaintext in `provider_settings`, same as RuTracker) |
| Out of scope | Browse pagination; package rename; encrypting credentials |

## Architecture

```
Settings (enabled + creds)
        ↓
Catalog.searchRefresh
        ↓ parallel
   Rutracker client    Kinozal client
        ↓                  ↓
   SearchResult[] (namespaced torrentId)
        ↓ merge + upsert + covers + quality sort
```

- **Tracker adapters** — implement existing `TrackerInterface` (`search`, `_getHTML`, `_parseHTML`, `getTorrent`, `getImage`).
- **Factory** — `Tracker = "Rutracker" | "Kinozal"`; `createTracker` / per-provider lazy clients in backend.
- **Catalog** — `searchTrackers` fans out to enabled+configured providers; merge results.
- **Routing** — `parseTorrentId(id)` → `{ tracker, rawId }`; download / cover / TitleWatch pick the matching client.
- **SSRF allowlist** — RuTracker `dl.php` + Kinozal download host/path (exact path confirmed after authenticated probe).

Import DAG unchanged: Catalog owns search orchestration; tracker clients stay adapters.

## Providers & settings

Per tracker provider config (`rutracker` / `kinozal`):

| Field | Notes |
|--------|--------|
| `login` / `password` | Required for live search/download |
| `proxyUrl?` | Optional HTTP(S) proxy |
| `enabled` | Include in Catalog / TitleWatch / cover routing |

Behavior:

- Settings UI: RuTracker and Kinozal forms; each has credentials, proxy, **Enabled**, Test.
- Credential/proxy change → clear that provider’s cookie store + invalidate its cached client.
- `enabled` without credentials → skip that source (log warning); do not fail whole Catalog.
- No enabled/configured trackers → local-only Catalog (current offline path).

## Identity & migration

- Adapters always emit namespaced `torrentId`.
- Absolute `topicUrl` / `torrentFileUrl` remain site-specific.
- qB tag: `brotracker:topic:rutracker:123` (and `kinozal:…`).
- Migration:
  1. Prefix `torrents.torrent_id` (and `image_key` paths that embed the id) with `rutracker:` where missing.
  2. Normalize any TitleWatch / topic refs stored as bare digits.
  3. Legacy qB tags: match `brotracker:topic:{n}` as `rutracker:{n}` until re-tagged on next add.
- Helpers: `parseTorrentId`, `formatTorrentId(tracker, rawId)`; FE source badge from prefix.

## Kinozal adapter

Live site facts (2026-08-05):

| Step | Endpoint |
|------|----------|
| Login | `POST /takelogin.php` — `username`, `password`, `returnto` |
| Search | `GET /browse.php?s=…&c=…` (+ sort/format params as needed) |
| Topic | `GET /details.php?id={id}` |
| Download | Authenticated `.torrent` bytes (exact URL confirmed after successful login) |
| Cover | From details HTML (`/i/poster/…` or external image host) |

Details:

- Charset **windows-1251**; site behind **Cloudflare**.
- Parse `table.t_peer` rows: `a[href^="/details.php?id="]`, size, seeds, peers, date, author.
- Category map: `c=1002` films aggregate, `c=1001` TV aggregate; store concrete section id in `forumId` when present (`cat(N)`).
- Reuse HDR/resolution parsing from title text where applicable.
- Unit tests on HTML fixtures; live integration skipped without env credentials.
- Test account supplied in chat failed login (“wrong password”) — need working creds before live verification; never commit secrets.

## Catalog merge

`searchRefresh`:

1. Resolve enabled trackers with usable credentials.
2. `Promise.allSettled` (or equivalent) per tracker `search`.
3. Namespace already applied by adapters; concat results.
4. `totalResults`: sum of totals when all numeric; else `null`.
5. Upsert → load image keys → quality sort → enqueue missing covers.
6. If every tracker errors/unavailable → same failure semantics as today.

## TitleWatch / workers / download

- Watch checks and cover fetch call `getTrackerFor(torrentId)` (or fan-out search across enabled trackers when discovering new Topics).
- `add-from-tracker`: allowlist Kinozal download URLs; fetch via the matching authenticated client.
- Topic URL builders become tracker-aware (no RuTracker-only hardcoding for namespaced ids).

## Frontend

- Settings sections for both trackers + Enabled toggles.
- Search results: source badge from `torrentId` prefix.
- i18n en/ru for new copy.
- Thin routes unchanged; feature UI under `features/settings` (+ search/title where source is shown).

## Domain / docs

- Update `CONTEXT.md`: Topic is tracker-side listing identity (any supported tracker); Provider includes Kinozal.
- Short ADR: multi-tracker Providers + namespaced torrent ids.
- Implementation plan: `docs/plans/2026-08-05-kinozal-tracker.md`.
- User-facing release note under `changes/unreleased/` when shipping.

## Success criteria

- User can enable RuTracker and/or Kinozal in settings; search returns merged namespaced hits.
- Download and cover work for both sources.
- TitleWatch/workers consider enabled trackers.
- Existing RuTracker data remains reachable after migration (prefixed ids + legacy tag compat).
- Offline unit parse tests for Kinozal browse/details HTML; no secrets in repo.
