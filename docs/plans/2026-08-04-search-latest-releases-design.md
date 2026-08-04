# Search page: latest cached releases

Date: 2026-08-04  
Status: approved

## Goal

When `/search` opens with no query, show the 50 most recent torrents from the local cache instead of an empty page.

## Decisions

| Topic | Choice |
|--------|--------|
| Source | Local Postgres only |
| Order | `registered_at DESC` |
| Limit | 50 |
| Tracker refresh on empty page | No |
| Empty cache | EmptyState explaining search will fill the cache |

## API

`torrent.recent` (`protectedProcedure`):

- Input: optional `{ limit?: number }` default 50, max 100
- Output: same shape as `torrent.search` (`{ results, totalResults }`)
- Behavior: `listRecent(limit)` → map covers/`imageUrl`

## Frontend

- `!hasActiveSearch` → `useQuery(trpc.torrent.recent)`
- Reuse table/cards + download dialog
- Badge: «Последние релизы»
- Active search unchanged (local + refresh)

## Index

Add `torrents_registered_at_idx` on `registered_at DESC` if migrations are cheap; otherwise defer (LIMIT 50 on small cache is fine).
