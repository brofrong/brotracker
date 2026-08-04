# Search: local-first + parallel tracker refresh

Date: 2026-08-04  
Status: approved

## Goal

Make `/search` feel instant: show local DB hits immediately, refresh from RuTracker in parallel, replace the list when the tracker finishes, and keep the UI usable while refresh is in flight.

Supersedes the explicit **Локально** / **Трекер** source toggle and the stale `force` / miss-fallback model in `2026-07-31-torrent-search-cache-design.md` for the search page UX (local cache + cover pipeline stay as-is).

## Decisions

| Topic | Choice |
|--------|--------|
| Result update | Full replace when refresh returns (no row merge) |
| Source toggle | Remove; one search action only |
| API shape | Two procedures: local + refresh |
| Transport | Two frontend requests (React Query), not SSE/polling |
| Empty local + refresh in flight | Empty list + non-blocking tracker indicator |
| Tracker indicator | Always visible while refresh is in flight |
| Tracker failure | Keep local results; toast error; hide indicator |
| Tracker empty (ok) | Replace with empty; not an error |

## Request flow

1. User submits query (Enter or «Найти»).
2. URL: `?search=<q>` only (`source` removed).
3. Frontend starts two queries in parallel when `search` is non-empty:
   - `torrent.search` → local Postgres (trigram) → paint results ASAP.
   - `torrent.searchRefresh` → RuTracker → upsert → return fresh list → **replace** UI results.
4. While `searchRefresh` is fetching: show non-blocking indicator («Ищем на трекере…»). Table/cards, download dialog, layout remain interactive. No fullscreen blocking spinner for the whole page after local has answered (initial local load may still use a short loading state if needed).
5. On refresh success: replace results; hide indicator. Badge/copy simplifies to count / «обновлено», not local-vs-tracker source choice.
6. On refresh error (tracker down, timeout, not configured): keep current local results; hide indicator; show **toast** with error.
7. Query change / new submit: new query keys; stale refresh results ignored.

Empty / whitespace `search` → do not call either procedure.

## API

### `torrent.search`

- Auth: `protectedProcedure` (unchanged).
- Input: `{ search?: string }` (tracker `options` not needed).
- Behavior: normalize → `searchLocal` → map covers/`imageUrl` → return.
- Output: `{ results: CatalogSearchResult[]; totalResults: number }`.
- Does not call the tracker.

### `torrent.searchRefresh`

- Auth: `protectedProcedure`.
- Input: `{ search?: string; options?: { category?; sortType?; sortOrder? } }` (reuse existing tracker options if present).
- Behavior: call tracker → on success upsert + covers enqueue (same as today’s tracker path) → return mapped results.
- On tracker failure / unavailable: **throw** (do not soft-return empty) so the client can toast.
- Output: same shape as `torrent.search`.

Remove `source` from the public search contract. Call sites that still pass `source` (if any outside `/search`) should move to the matching procedure.

## Frontend

| Area | Change |
|------|--------|
| `search-bar.tsx` | Single submit control; remove Локально / Трекер |
| `search.tsx` URL schema | Drop `source`; keep `search` |
| Data | `useQuery` for `torrent.search` + `useQuery` for `torrent.searchRefresh` |
| Display data | Prefer refresh data when settled successfully; else local |
| Indicator | Bound to refresh `isFetching` / pending |
| Toast | On refresh `isError` for the active query (once per failure) |

## Out of scope

- Streaming / SSE single response
- Merging local + tracker rows in one list
- Live cover websocket/poll on the search page
- Changing trigram / upsert / cover queue internals beyond what refresh already needs

## Test focus

- Backend: `search` never hits tracker; `searchRefresh` upserts and returns; tracker error propagates as procedure error.
- Frontend: indicator while refresh fetching; replace on success; toast on error; local results retained on refresh failure.
