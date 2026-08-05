# Module boundaries and import DAG

We organize the backend as deep feature modules with a directed acyclic import graph so ownership and change locality stay clear for humans and agents.

**Layers (dependencies point down only):** routers/workers → feature cores → adapters (`db/*`, qbittorrent, storage, tracker) → infra (`http`, env, drizzle).

**Feature shape:** each feature folder exposes `createX(deps)` in `<feature>.ts`, wires adapters only in `index.ts`, keeps `*.router.ts` thin (Zod + call + map errors), and puts persistence in `*.repository.ts`. Feature cores talk to the outside only through ports in `<feature>.types.ts`.

**Forbidden:** feature A importing feature B’s implementation; routers owning business logic; infra helpers living under a feature folder (e.g. proxy agents belong in `http/`).

**Catalog vs torrent:** Catalog owns search orchestration; tracker client + torrent repository are adapters. The tRPC `torrent` namespace may remain as a public alias, but the owner of search behaviour is Catalog. Shared hit types live with the data owner — repositories must not import Catalog.

**Watch:** the watch pipeline stays under `title/watch/` as a submodule with its own composition entry — not a free cross-import hub from other features. Home may consume watch/feed data only via ports or read-model helpers, not by importing title repositories.

**Naming debt:** folder `qbittorent` is a known misspelling; migrate to `qbittorrent` when touching that area — do not introduce a second spelling.
