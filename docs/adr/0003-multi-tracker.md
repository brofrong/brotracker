# ADR 0003: Multi-tracker Providers and namespaced torrent ids

## Status

Accepted (2026-08-05)

## Context

BroTracker originally treated RuTracker topic ids as global primary keys. Adding Kinozal (and future trackers) would collide numeric ids across sites. Catalog search must also fan out to multiple enabled Providers.

## Decision

1. **Tracker Providers** — RuTracker and Kinozal are separate Providers with credentials, optional proxy, cookie stores, and an `enabled` flag in settings. Catalog / TitleWatch live search uses all enabled+configured trackers in parallel; partial failures are logged and merged when at least one succeeds.

2. **Namespaced torrent ids** — Cached Torrents use `torrent_id` values of the form `{source}:{rawId}` (`rutracker:123`, `kinozal:456`). Adapters emit namespaced ids. Bare digits are legacy RuTracker and are migrated / accepted by parsers.

3. **qB tags** — `brotracker:topic:{namespacedId}`; legacy `brotracker:topic:{digits}` still matches RuTracker topics.

4. **Package layout** — Tracker HTTP/HTML adapters remain in `@brotracker/rutracker-ts` for now (Kinozal beside RuTracker). Renaming the package is deferred.

## Consequences

- Migration prefixes existing torrent rows and cover keys.
- Download SSRF allowlists and topic URL helpers are tracker-aware.
- UI shows a source badge derived from the id prefix.
- Future trackers follow the same namespace + Provider `enabled` pattern.
