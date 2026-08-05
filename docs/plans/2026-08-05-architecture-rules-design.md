# Architecture rules — design & migration

Date: 2026-08-05  
Status: accepted (rules written; code migration incremental)

## Goals

Make BroTracker navigable for humans and AI agents: clear ownership, an acyclic import graph, thin HTTP/UI edges, and a shared domain vocabulary.

## What we locked in

| Artifact | Role |
|---|---|
| `CONTEXT.md` | Domain glossary |
| `docs/adr/0001-module-boundaries.md` | Backend deep modules + import DAG |
| `docs/adr/0002-frontend-vertical-slices.md` | Frontend VFS + thin routes |
| `.cursor/rules/architecture.mdc` | Always-on pointer |
| `.cursor/rules/frontend-features.mdc` | FE conventions |
| `.cursor/rules/backend-modules.mdc` | BE conventions |

## Frontend target

```
apps/frontend/src/
  routes/           # thin compose only
  features/<name>/  # UI + data hooks
  shared/{ui,lib}/
```

## Backend target

Feature folders follow `createX` + `index` composition + thin router. Imports flow routers → cores → adapters → infra. Watch lives under `title/watch/`. Catalog owns search; torrent repo/tracker are adapters.

## Migration order (A → B → C)

### Phase A — docs & rules (done in this change)

- [x] `CONTEXT.md`
- [x] ADRs 0001–0002
- [x] Cursor rules
- [x] `AGENTS.md` pointer

### Phase B — discipline on new/touched code

- New backend code uses the feature skeleton; no new cross-feature implementation imports.
- New FE UI goes into `features/<name>/`, not into route files or flat `components/`.
- When editing settings/provider/http helpers, move infra out of feature folders if touched.

### Phase C — structural cleanups (one PR each)

1. **FE god routes** — extract `torrents`, `title.$id`, `settings` into `features/*` (highest agent payoff).
2. **Align search/home** — move `components/search` and home widgets under `features/`.
3. **Backend type seam** — remove `torrent.repository` → catalog type dependency.
4. **`title/watch/`** — group watch pipeline files under submodule + short README map.
5. **Rename `qbittorent` → `qbittorrent`** — folder, imports, tRPC key (breaking for clients; do deliberately).

## Out of scope for now

- Enforcing the DAG with a custom ESLint rule (nice later).
- Splitting backend into multiple packages.
- Rewriting deep cores that already follow `createX(deps)`.
