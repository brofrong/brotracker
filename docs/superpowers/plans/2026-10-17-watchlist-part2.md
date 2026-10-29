# Watchlist «Жду» (Part 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The user marks a film or series «Жду»; a periodic worker finds the first release that matches the Title and the user's quality rules, adds it to qBittorrent, and the watch moves through Жду → Качается → (Слежу) → Готово, visible on a new «Жду» page.

**Architecture:** The existing `title_watches` table becomes the one watch per Title: it gets its own `id` primary key, `topic_url` becomes nullable-unique, and two new states (`waiting`, `downloading`) join `tracking | paused | completed | off`. Pure functions pick a release (`release-pick.ts`) and run the waiting search (`waiting-search.ts`) behind ports; the Title feature composes them with TMDB, catalog search and qBittorrent, and a new Worker runs them on an interval read from Settings. The frontend adds a Settings section, an animated «Жду» button, and a `/watchlist` page.

**Tech Stack:** Bun, TypeScript, drizzle-orm/drizzle-kit 1.0.0-rc.4 (Postgres), tRPC, `bun test`, React, TanStack Router/Query, Vitest, Astryx, `canvas-confetti` (new).

**Spec:** `docs/superpowers/specs/2026-10-17-watchlist-design.md` — "Part 2 — Unified watch and «Жду»" and "Carry-overs from part 1". Part 1 code is merged (`release-title.ts`, `release-match.ts`, `TitleMeta.originalName/alternativeNames`).

## Global Constraints

- Backend module rules `docs/adr/0001-module-boundaries.md`: watch code stays under `apps/backend/src/title/` (`title/watch/` for persistence); `workers` invokes Title only through exports of `title/index.ts`; routers stay thin. Frontend slices `docs/adr/0002-frontend-vertical-slices.md`: new page lives in `apps/frontend/src/features/watchlist/`; no cross-feature imports (shared bits go to `shared/`).
- Astryx components and tokens only (`AGENTS.md`): no raw `<div>`/`<span>` layout, no `style={{…}}`, no hardcoded hex/px/arbitrary Tailwind. Check every component with `bunx astryx component <Name>`.
- Watch states (`TitleWatchState`): `waiting | downloading | tracking | paused | completed | off`. Films: `waiting → downloading → completed`. Series: `waiting → tracking` (existing nightly update tracking takes over) `→ completed`.
- Take the **first** matching release that passes the rules, then stop searching that Title. Never auto-download a release that fails the Release match (part 1 `releaseMatchesTitle`) or is a camrip.
- Quality settings (stored in `app_settings` under key `watchlist_settings` as JSON): `checkIntervalHours ∈ {1,2,4,6,12,24}` default **24**; `minResolution ∈ {"720p","1080p","4K"}` default `"1080p"`; `hdrOnly: boolean` default `false`; `requireRussianVoice: boolean` default `true`. Resolution order `720p < 1080p < 4K`; `null` resolution never passes. Camrips always rejected.
- Series watch waits for the latest season: `season = meta.seasons` (TMDB `number_of_seasons`) at the moment «Жду» is pressed; a tv release passes only when its parsed season equals it.
- Waiting-search queries: for each distinct searchable name among [original (part-1 `searchableOriginalName` rule: must contain Latin or Cyrillic letters), Russian `meta.name` (TMDB `ru-RU`)]: films → `<name> <year>` and `<name>`; series → `<name> сезон <season>`. Merge tracker results, dedupe by `torrentId`.
- Remove («Убрать»): a series watch that has a topic → `watch = "off"` (so qB sync doesn't recreate it); anything else → delete the row.
- Copy (ru / en), exact:
  - Stages: `watchlist.stage.waiting` «Жду»/«Waiting»; `downloading` «Качается»/«Downloading»; `tracking` «Слежу»/«Following»; `completed` «Готово»/«Done».
  - Outcomes: `no-releases` «Раздач пока нет»/«No releases yet»; `only-camrip` «Есть только экранка — пропущена»/«Only screen recordings — skipped»; `below-resolution` «Есть только {{best}} — ниже порога»/«Only {{best}} — below your minimum»; `no-hdr` «Нет раздач с HDR»/«No HDR releases»; `no-voice` «Нет русской озвучки»/«No Russian voice-over»; `search-failed` «Трекеры недоступны — повторю позже»/«Trackers unavailable — will retry».
  - Button: `title.wait.add` «Жду»/«Wait for it»; `title.wait.active` «Жду»/«Waiting»; hint `title.wait.hint` «Проверка раз в {{hours}} ч · {{rules}}»/«Checked every {{hours}} h · {{rules}}»; rules fragments `title.wait.rules.minResolution` «{{value}}+»/«{{value}}+», `hdr` «HDR»/«HDR», `voice` «с озвучкой»/«Russian voice».
  - Events: `titleWatchFeed.events.downloadStarted` «Начал качаться»/«Started downloading»; `downloaded` «Скачан»/«Downloaded»; `addFailed` «Не удалось добавить в qBittorrent»/«Couldn't add to qBittorrent».
  - Page: `watchlist.heading` «Жду»/«Watchlist»; `watchlist.filter.all` «Все»/«All»; `watchlist.checkedAt` «проверено {{time}}»/«checked {{time}}»; menu `watchlist.menu.checkNow` «Проверить сейчас»/«Check now», `open` «Открыть»/«Open», `remove` «Убрать»/«Remove», `pause` «Пауза»/«Pause», `resume` «Продолжить»/«Resume»; empty `watchlist.empty` «Пока ничего не ждёте»/«Nothing on your watchlist yet»; nav `nav.watchlist` «Жду»/«Watchlist».
  - Settings: section `settings.sections.watchlist` «Жду»/«Watchlist»; `settings.watchlist.interval` «Проверять каждые»/«Check every»; `minResolution` «Минимальное разрешение»/«Minimum resolution»; `hdrOnly` «Только HDR»/«HDR only»; `requireVoice` «Нужна русская озвучка»/«Require Russian voice-over»; `camripNote` «Экранки (CAMRip, TS, TC) отсекаются всегда»/«Screen recordings (CAMRip, TS, TC) are always skipped»; hour option «{{count}} ч»/«{{count}} h».
- Worker: id `watchlist-search`, name «Поиск ожидаемых», description «Ищет раздачи для фильмов и сериалов из «Жду»».
- Reduced motion: the «Жду» animation is skipped when `prefers-reduced-motion: reduce`.

## Review Focus

- Title that already has a watch (series followed earlier, or auto-linked from qB) gets «Жду» → no second row; the button shows the existing stage. Test in Task 6.
- Found release whose topic is already tracked by another row (downloaded by hand earlier) → no unique-constraint crash: the existing row gets the `titleId`, the waiting row is deleted. Test in Task 5.
- Trackers or qBittorrent down mid-run → the watch stays `waiting` with outcome `search-failed` (or an `add-failed` event), the run continues with the next title, retried next run. Test in Task 5.
- Film whose torrent disappeared from qB while `downloading` → stays `downloading` (not marked completed). Test in Task 5.
- Interval changed in Settings → next tick uses it without restart; no previous run → due immediately. Test in Task 7.

---

### Task 1: Parser — season, RuTor P1/P2, `×` resolutions

**Files:**

- Modify: `packages/rutracker-ts/src/tracker/release-title.ts`
- Test: `packages/rutracker-ts/test/unit/release-title.test.ts`

**Interfaces:**

- Produces: `ParsedReleaseTitle.season: number | null` (single season only; ranges/multi-season packs → `null`).

- [ ] **Step 1: Write the failing tests** (new `describe("season")` table + flag rows; all existing rows keep passing)
  - season: `Одни из нас / The Last of Us / Сезон: 2 / Серии: 1-7 из 7 (Крэйг Мазин) [2025, …]` → 2; `Одни из нас (2 сезон: 1-7 серии из 7) / The Last of Us / 2025 / ПМ / WEB-DL (1080p)` → 2; `The.Last.of.Us.S02E05.1080p.WEB-DL` → 2; `Show / Шоу / S03 / 2025 / WEB-DL (1080p)` → 3; `Stranger Things / Season 5 [2025, WEB-DL]` → 5; `Друзья / Friends / Сезон: 1-10 [1994-2004, BDRip]` → `null`; `Одиссея / The Odyssey [2026, WEB-DL 2160p]` → `null`.
  - voice: `Фильм / Film (2026) WEB-DL 1080p | P1` → `hasRussianVoice: false`; `… | P2` → false; `… | P` → true; `… | D` → true.
  - year: `Фильм / Film [1920×1080, 2026, BDRip]` → year 2026; `Фильм / Film [1920x1080, 2026, BDRip]` → 2026.
- [ ] **Step 2: Run to verify failure** — `cd packages/rutracker-ts && bun test test/unit/release-title.test.ts` → FAIL (`season` undefined, P1/P2, `×`).
- [ ] **Step 3: Implement.** Season from (first hit): `Сезон[:\s]*N` / `N сезон` / `Season N` / `S(\d+)(E\d+)?` token; a range `N-M` → `null`. Drop `\d?` from the RuTor `P` suffix so only bare `| P` counts. Treat `×` like `x` when skipping resolution-like numbers in year detection.
- [ ] **Step 4: Run to verify pass** — same command → PASS; then `bun test test/unit`.
- [ ] **Step 5: Commit** — `git commit -m "feat(tracker): parse season; P1/P2 and × resolutions no longer misread"`

---

### Task 2: Unified watch schema, record and repository

**Files:**

- Modify: `apps/backend/src/db/title/title-watch.schema.ts`, `apps/backend/src/db/title/title-watch-event.schema.ts`
- Create: `apps/backend/drizzle/<generated>_watchlist/migration.sql` (via `bun run db:generate`, then hand-edit)
- Modify: `apps/backend/src/title/watch/check-topic-now.ts` (`TitleWatchRecord`, `WatchState`, `RecordWatchEventInput`), `title-watch-event.ts` (kinds), `title-watch.repository.ts`, `title-watch-event.repository.ts`, `sync-watches-from-qb.ts`, `watch.types.ts`, `index.ts`
- Modify: `apps/backend/src/title/title.ts` (`add` sets `id`/`kind`), `title.types.ts` (`TitleWatchState`, `TitleWatchView`)
- Modify: `CONTEXT.md`
- Test: existing `apps/backend/src/title/**/*.test.ts` fixtures updated; new `apps/backend/src/title/watch/title-watch.repository.test.ts` for the row mapping helpers

**Interfaces:**

- Produces:

  ```ts
  export type WatchState =
  	"waiting" | "downloading" | "tracking" | "paused" | "completed" | "off";
  export type WaitingOutcome =
  	| "no-releases"
  	| "only-camrip"
  	| "below-resolution"
  	| "no-hdr"
  	| "no-voice"
  	| "search-failed";
  export type TitleWatchRecord = {
  	id: string;
  	topicUrl: string | null;
  	titleId: string | null;
  	kind: TitleKind | null;
  	watch: WatchState;
  	source: "auto-qb" | "manual";
  	season: number | null;
  	titleName: string | null;
  	poster: string | null;
  	year: number | null;
  	size: number | null;
  	registeredAt: string | null;
  	contentHash: string | null;
  	qbHash: string | null;
  	lastCheckedAt: string | null;
  	lastChangedAt: string | null;
  	lastError: string | null;
  	waitingOutcome: WaitingOutcome | null;
  	waitingOutcomeDetail: string | null;
  	createdAt: string;
  };
  // TitleWatchEventKind adds: "download-started" | "downloaded" | "add-failed"; event topicUrl: string | null
  // repository (title-watch.repository.ts), all exported and wired into WatchStore:
  export function loadWatchById(id: string): Promise<TitleWatchRecord | null>;
  export function deleteWatch(id: string): Promise<void>;
  export function listWatchesByState(
  	states: WatchState[],
  ): Promise<TitleWatchRecord[]>;
  export function listWatchlistRecords(): Promise<TitleWatchRecord[]>; // titleId not null AND watch <> 'off', newest first
  export function toWatchRow(record: TitleWatchRecord): TitleWatchRow;
  export function fromWatchRow(row: TitleWatchRow): TitleWatchRecord; // exported for tests
  ```

  `saveWatch` upserts on `id`. Every code path that creates a record sets `id: crypto.randomUUID()` and `createdAt` (sync-from-qb rows: `kind: "tv"`).

- [ ] **Step 1: Write the failing mapping test** — `fromWatchRow(toWatchRow(record))` round-trips a `waiting` record with `topicUrl: null`, `season: 5`, `waitingOutcome: "below-resolution"`, `waitingOutcomeDetail: "720p"`, ISO dates.
- [ ] **Step 2: Run** — `cd apps/backend && bun test src/title/watch/title-watch.repository.test.ts` → FAIL.
- [ ] **Step 3: Schema + migration.** Columns: `id text PK`, `topic_url text UNIQUE NULL`, `kind text`, `season integer`, `title_name text`, `poster text`, `year integer`, `waiting_outcome text`, `waiting_outcome_detail text`, `created_at timestamptz not null default now()`; events `topic_url` nullable. Run `bun run db:generate`, then make `migration.sql` do, in order: add `id` nullable → `UPDATE title_watches SET id = gen_random_uuid()::text, kind = 'tv'` → set `id` NOT NULL → drop the `topic_url` PK constraint → add PK on `id` → `topic_url` drop NOT NULL + unique constraint → add the other columns → events `topic_url` drop NOT NULL. Keep `snapshot.json` consistent with the schema files.
- [ ] **Step 4: Types, repository, call sites.** Thread the new fields; `listTrackingWatches` still returns only `watch = 'tracking'` rows (so nightly enqueue ignores new states). `TitleWatchView` gains `id`, `kind`, `season`, `waitingOutcome`, `waitingOutcomeDetail`, nullable `topicUrl`, and the 6-state `watch`. Add to `CONTEXT.md` under TitleWatch: the six states and "one TitleWatch per Title; topic attached once found".
- [ ] **Step 5: Verify migration on a scratch DB** — `docker run -d --name bt-mig -p 5499:5432 -e POSTGRES_USER=brotracker -e POSTGRES_PASSWORD=brotracker -e POSTGRES_DB=brotracker postgres:latest`, then `cd apps/backend && DATABASE_URL=postgresql://brotracker:brotracker@localhost:5499/brotracker bun run src/db/migrate.ts` → exit 0 (all migrations apply on an empty DB). Then `docker rm -f bt-mig`. Backfill of existing rows is checked by the controller on a dev-DB copy.
- [ ] **Step 6: Run** — `cd apps/backend && bun test src && bunx tsc --noEmit` → PASS.
- [ ] **Step 7: Commit** — `git commit -m "feat(watch): one watch per title with waiting and downloading states"`

---

### Task 3: Watchlist settings (backend)

**Files:**

- Create: `apps/backend/src/settings/watchlist-settings.ts`, `apps/backend/src/settings/watchlist-settings.test.ts`
- Modify: `apps/backend/src/settings/settings.router.ts`

**Interfaces:**

- Produces:

  ```ts
  export type WatchlistSettings = {
  	checkIntervalHours: 1 | 2 | 4 | 6 | 12 | 24;
  	minResolution: "720p" | "1080p" | "4K";
  	hdrOnly: boolean;
  	requireRussianVoice: boolean;
  };
  export const DEFAULT_WATCHLIST_SETTINGS: WatchlistSettings; // {24, "1080p", false, true}
  export const watchlistSettingsSchema: z.ZodType<WatchlistSettings>;
  export function parseWatchlistSettings(raw: string | null): WatchlistSettings; // null/invalid JSON/invalid shape → defaults; partial → merged over defaults
  export function loadWatchlistSettings(): Promise<WatchlistSettings>;
  export function saveWatchlistSettings(
  	input: WatchlistSettings,
  ): Promise<WatchlistSettings>;
  ```

  tRPC: `settings.watchlist.get` (query) and `settings.watchlist.set` (mutation, input `watchlistSettingsSchema`).

- [ ] **Step 1: Failing tests** for `parseWatchlistSettings`: `null` → defaults; `"not json"` → defaults; `'{"minResolution":"4K"}'` → defaults with `minResolution:"4K"`; `'{"checkIntervalHours":3}'` → defaults (3 not allowed).
- [ ] **Step 2: Run** — `cd apps/backend && bun test src/settings/watchlist-settings.test.ts` → FAIL.
- [ ] **Step 3: Implement** on `app_settings` key `watchlist_settings` (JSON string value, upsert like `ensureBetterAuthSecret`).
- [ ] **Step 4: Run** → PASS; `bunx tsc --noEmit`.
- [ ] **Step 5: Commit** — `git commit -m "feat(settings): watchlist quality rules and check interval"`

---

### Task 4: Release pick

**Files:**

- Create: `apps/backend/src/title/release-pick.ts`, `apps/backend/src/title/release-pick.test.ts`

**Interfaces:**

- Consumes: `parseReleaseTitle` (Task 1, with `season`), `releaseMatchesTitle`/`MatchTarget` (part 1), `scoreTorrentQuality` (`apps/backend/src/torrent/quality-score.ts`), `WatchlistSettings` (Task 3), `TitleTorrentCandidate` (`title.types.ts`), `WaitingOutcome` (Task 2).
- Produces:

  ```ts
  export type PickTarget = MatchTarget & { season: number | null };
  export type PickResult =
  	| { status: "found"; candidate: TitleTorrentCandidate }
  	| {
  			status: "none";
  			outcome: Exclude<WaitingOutcome, "search-failed">;
  			detail: string | null;
  	  };
  export function pickRelease(
  	candidates: TitleTorrentCandidate[],
  	target: PickTarget,
  	rules: WatchlistSettings,
  ): PickResult;
  ```

- [ ] **Step 1: Failing tests** (target films «Одиссея»/«The Odyssey» 2026, rules defaults):
  - no candidates / only «Космическая одиссея [1968]» → `{none, "no-releases", null}`.
  - only matching CAMRip → `"only-camrip"`.
  - matching 720p Dub only → `{none, "below-resolution", "720p"}` (detail = best resolution among non-camrip matches; `null` resolution → detail `null`).
  - `hdrOnly: true`, matching 1080p SDR Dub → `"no-hdr"`.
  - matching 1080p without voice (`Original + Sub`) → `"no-voice"`; same with `requireRussianVoice:false` → found.
  - two passing (1080p 50 seeds, 4K HDR 300 seeds) → found = the higher `scoreTorrentQuality`.
  - tv target season 5: release `Сезон: 4` → `"no-releases"`; `Сезон: 5` passing → found.
  - outcome reports the furthest stage reached: match → not camrip → resolution → hdr → voice.
- [ ] **Step 2: Run** — `cd apps/backend && bun test src/title/release-pick.test.ts` → FAIL.
- [ ] **Step 3: Implement** with that stage order.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(title): pick the best release that passes the watchlist rules"`

---

### Task 5: Waiting search and film completion

**Files:**

- Create: `apps/backend/src/title/waiting-search.ts`, `apps/backend/src/title/waiting-search.test.ts`

**Interfaces:**

- Consumes: `pickRelease`/`PickTarget` (Task 4), `TitleWatchRecord` and store functions (Task 2), `topicTag`, `extractTopicId`, `findTransferForTopic` (`apps/backend/src/title/topic-tag.ts`), `TaggedQbTorrent`.
- Produces:

  ```ts
  export type WaitingTarget = PickTarget & { queries: string[] };
  export type WaitingSearchDeps = {
  	listWaiting: () => Promise<TitleWatchRecord[]>;
  	listDownloading: () => Promise<TitleWatchRecord[]>;
  	loadWatchById: (id: string) => Promise<TitleWatchRecord | null>;
  	loadWatchByTopicUrl: (topicUrl: string) => Promise<TitleWatchRecord | null>;
  	saveWatch: (r: TitleWatchRecord) => Promise<void>;
  	deleteWatch: (id: string) => Promise<void>;
  	loadTarget: (watch: TitleWatchRecord) => Promise<WaitingTarget | null>;
  	searchTracker: (query: string) => Promise<TitleTorrentCandidate[]>; // throws when trackers unavailable
  	loadRules: () => Promise<WatchlistSettings>;
  	addToQb: (
  		torrentFileUrl: string,
  		kind: TitleKind,
  		tags: string[],
  	) => Promise<void>;
  	listTaggedTorrents: () => Promise<TaggedQbTorrent[]>;
  	recordEvent: (e: RecordWatchEventInput) => Promise<void>;
  	now: () => string;
  };
  export type WaitingSearchRun = {
  	checked: number;
  	started: number;
  	failed: number;
  };
  export function createWaitingSearch(deps: WaitingSearchDeps): {
  	runAll(log?: (line: string) => void): Promise<WaitingSearchRun>;
  	checkOne(watchId: string): Promise<TitleWatchRecord | null>;
  	syncDownloads(): Promise<{ completed: number }>;
  };
  ```

  Found → `addToQb(url, kind, [topicTag(topicId)])`; films → `watch:"downloading"`, series → `watch:"tracking"`, `source:"manual"`; set `topicUrl`, `size`, `lastChangedAt`, clear outcome; event `download-started` (`message` = release title, `newSize` = size). Not found → keep `waiting`, set `waitingOutcome`/`Detail`, `lastCheckedAt`. Search throws → outcome `search-failed`, `lastError`. `addToQb` throws → stays `waiting`, `lastError`, event `add-failed` (message = error). Topic already owned by another row → that row gets `titleId`/`kind`/`titleName`/`poster`/`year` (keep its state), waiting row deleted, no add. `syncDownloads`: for each `downloading` film, transfer found by topic tag with `progress >= 1` → `completed` + event `downloaded`; no transfer → unchanged.

- [ ] **Step 1: Failing tests** with in-memory fakes, one per behaviour above, plus: `runAll` keeps going after one title's search throws (second title still started); queries passed to `searchTracker` are exactly `target.queries`, results deduped by `torrentId`.
- [ ] **Step 2: Run** — `cd apps/backend && bun test src/title/waiting-search.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(title): search waiting titles and start the first good release"`

---

### Task 6: Title watchlist API and composition

**Files:**

- Create: `apps/backend/src/title/watchlist.ts`, `apps/backend/src/title/watchlist.test.ts`
- Modify: `apps/backend/src/title/index.ts` (compose `createWaitingSearch` + `createWatchlist`; export `waitingSearch`), `title.ts` (`get` returns `watch` for films too — load by `titleId` for any facet, auto-link stays tv-only; backfill `titleName/poster/year` on a loaded watch when null), `title.types.ts`, `title.router.ts`

**Interfaces:**

- Consumes: Tasks 2, 3, 5; `module.get({ id, language: "ru-RU" })` for `loadTarget` (the original name counts only if it contains a Latin or Cyrillic letter — mirror part 1's frontend `searchableOriginalName` in a small backend helper) (names = `[meta.name, meta.originalName, ...meta.alternativeNames]`, queries per Global Constraints); tracker search = `catalog.searchRefresh(query, {})` results mapped like `toCandidate` in `title/index.ts`, throwing on `status !== "ok"`.
- Produces:

  ```ts
  export type WatchlistItem = {
  	id: string;
  	titleId: string;
  	kind: TitleKind | null;
  	name: string | null;
  	poster: string | null;
  	year: number | null;
  	season: number | null;
  	watch: TitleWatchState;
  	topicUrl: string | null;
  	lastCheckedAt: string | null;
  	lastChangedAt: string | null;
  	lastError: string | null;
  	waitingOutcome: WaitingOutcome | null;
  	waitingOutcomeDetail: string | null;
  	episodes: EpisodeProgress | null;
  	transfer: TitleTorrentTransfer | null;
  	createdAt: string;
  };
  export type WatchlistDeps = {
  	getTitle: (titleId: string) => Promise<Title>; // module.get({ id, language: "ru-RU" })
  	loadWatchByTitleId: (titleId: string) => Promise<TitleWatchRecord | null>;
  	loadWatchById: (id: string) => Promise<TitleWatchRecord | null>;
  	listWatchlistRecords: () => Promise<TitleWatchRecord[]>;
  	saveWatch: (r: TitleWatchRecord) => Promise<void>;
  	deleteWatch: (id: string) => Promise<void>;
  	listTaggedTorrents: () => Promise<TaggedQbTorrent[]>;
  	listQbTorrents: () => Promise<SyncQbTorrent[]>; // for episode progress (parseEpisodeProgress)
  	checkWaiting: (watchId: string) => Promise<TitleWatchRecord | null>; // waitingSearch.checkOne
  	checkTracking: (titleId: string) => Promise<unknown>; // existing module.checkNow({ id })
  	now: () => string;
  	newId: () => string;
  };
  export function createWatchlist(deps: WatchlistDeps): {
  	wait(input: { titleId: string }): Promise<TitleWatchView>; // existing watch (not "off") → returned unchanged; "off" or none → waiting row (kind = facet, season = meta.seasons for tv, name/poster/year from meta)
  	remove(input: { id: string }): Promise<void>; // rule in Global Constraints
  	list(): Promise<WatchlistItem[]>; // listWatchlistRecords + qB transfers/episodes
  	checkNow(input: { id: string }): Promise<WatchlistItem | null>; // waiting → waitingSearch.checkOne; tracking/paused → existing checkNow path
  };
  ```

  tRPC (all `protectedProcedure`, thin): `title.wait({ id })`, `title.watchlist()`, `title.watchlistRemove({ id })`, `title.watchlistCheck({ id })`. `wait` on a non-`tmdb:` id → `PRECONDITION_FAILED`.

- [ ] **Step 1: Failing tests** (fakes): `wait` creates a `waiting` film row with name/poster/year; `wait` for tv stores `season = meta.seasons`; `wait` when a `tracking` watch exists returns it and creates nothing; `remove` deletes a waiting row, sets `off` for a tv row with a topic; `list` attaches `transfer` from the topic tag and excludes `off`; `title.get` for a film with a waiting watch returns `watch.watch === "waiting"`.
- [ ] **Step 2: Run** — `cd apps/backend && bun test src/title/watchlist.test.ts` → FAIL.
- [ ] **Step 3: Implement** + router + composition.
- [ ] **Step 4: Run** — `cd apps/backend && bun test src && bunx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(title): watchlist API — wait, list, remove, check now"`

---

### Task 7: «Поиск ожидаемых» worker and scheduler

**Files:**

- Create: `apps/backend/src/workers/watchlist-schedule.ts`, `apps/backend/src/workers/watchlist-schedule.test.ts`
- Modify: `apps/backend/src/workers/index.ts`

**Interfaces:**

- Consumes: `waitingSearch` export from `title/index.ts` (Task 6), `loadWatchlistSettings` (Task 3), `workers.get/run`.
- Produces:

  ```ts
  export const WATCHLIST_SEARCH_ID = "watchlist-search";
  export function isWatchlistSearchDue(input: {
  	lastStartedAt: string | null;
  	intervalHours: number;
  	now: Date;
  }): boolean;
  export function startWatchlistScheduler(deps: {
  	tickMs: number;
  	tick: () => Promise<void>;
  }): () => void;
  ```

  Definition `execute` → `waitingSearch.runAll(log)`, summary `проверено N · начато M · ошибок K`. Tick every **5 min**: `waitingSearch.syncDownloads()`; then if not running and `isWatchlistSearchDue({ lastStartedAt: lastRun?.startedAt ?? null, intervalHours: settings.checkIntervalHours, now })` → `workers.run(WATCHLIST_SEARCH_ID, { trigger: "scheduled" })`. Errors are logged, never thrown out of the tick. Started from `startWorkers()`.

- [ ] **Step 1: Failing tests** for `isWatchlistSearchDue`: no last run → true; last run 23 h ago with 24 → false; 24 h ago → true; interval 2, 2 h 1 min ago → true.
- [ ] **Step 2: Run** — `cd apps/backend && bun test src/workers/watchlist-schedule.test.ts` → FAIL.
- [ ] **Step 3: Implement** + registration.
- [ ] **Step 4: Run** — `cd apps/backend && bun test src && bunx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(workers): scheduled watchlist search"`

---

### Task 8: Settings → «Жду» section (frontend)

**Files:**

- Create: `apps/frontend/src/features/settings/watchlist-settings.tsx`, `apps/frontend/src/routes/settings.watchlist.tsx`
- Modify: `apps/frontend/src/features/settings/settings-layout.tsx` (SECTIONS gains `{ id: "watchlist", to: "/settings/watchlist" }` after downloads), `apps/frontend/src/shared/i18n/locales/{ru,en}.json`

**Interfaces:**

- Consumes: `trpc.settings.watchlist.get/set` (Task 3).

- [ ] **Step 1: Build the section** following `downloads-settings.tsx`: `Selector` for interval (1/2/4/6/12/24, hour copy) and min resolution; switches for HDR only and Russian voice; supporting text `camripNote`; save button + toast like downloads.
- [ ] **Step 2: Verify** — `cd apps/frontend && bunx tsc --noEmit && bun run check && bun run build` → clean (pre-existing baseline errors in untouched `router.tsx`/`vite.config.ts` excepted).
- [ ] **Step 3: Commit** — `git commit -m "feat(settings): watchlist section"`

---

### Task 9: «Жду» button with animation (title page)

**Files:**

- Create: `apps/frontend/src/features/title/wait-button.tsx`, `apps/frontend/src/features/title/wait-state.ts`, `apps/frontend/src/features/title/wait-state.test.ts`
- Modify: `apps/frontend/src/features/title/title-hero.tsx`, `apps/frontend/package.json` (add `canvas-confetti` + `@types/canvas-confetti`), i18n files

**Interfaces:**

- Consumes: `title.get` → `watch: TitleWatchView | null` (Task 2/6), `trpc.title.wait`, `trpc.settings.watchlist.get`.
- Produces (`wait-state.ts`):

  ```ts
  export type WaitButtonState =
  	| { kind: "add" }
  	| { kind: "waiting" }
  	| { kind: "stage"; stage: "downloading" | "tracking" | "completed" };
  export function waitButtonState(
  	watch: { watch: TitleWatchState } | null,
  ): WaitButtonState; // null/"off" → add; waiting → waiting; downloading → stage downloading; tracking|paused → stage tracking; completed → stage completed
  export function rulesSummary(
  	s: WatchlistSettings,
  	t: (key: string, o?: object) => string,
  ): string; // e.g. "1080p+ · с озвучкой"; "4K+ · HDR · с озвучкой"
  ```

- [ ] **Step 1: Failing vitest** for `waitButtonState` (all six states + null) and `rulesSummary` (defaults → `"1080p+ · с озвучкой"`; `{4K, hdr, no voice}` → `"4K+ · HDR"`).
- [ ] **Step 2: Run** — `cd apps/frontend && bunx vitest run src/features/title/wait-state.test.ts` → FAIL.
- [ ] **Step 3: Implement helpers** → PASS.
- [ ] **Step 4: Button.** Full width on mobile, next to the title block on desktop. On add: call `wait`; animate the button with the Web Animations API (`element.animate`: scale 1 → 0.92 → 1.06 → 1 over `--duration-medium`, `--ease-standard`), fire `canvas-confetti` from the button's centre (`disableForReducedMotion: true`, ~40 particles, chart-palette colours read from CSS variables), `navigator.vibrate?.(15)`; label swaps to «⏳ Жду» and the hint (`title.wait.hint` with `rulesSummary`) fades in. Skip the scale animation when `matchMedia("(prefers-reduced-motion: reduce)")` matches. Stage states render a status badge instead of the button. Keep the existing series `TitleWatchPanel` for tracking/paused controls. Invalidate `title.get` after `wait`.
- [ ] **Step 5: Verify** — `cd apps/frontend && bunx tsc --noEmit && bun run check && bun run test && bun run build`.
- [ ] **Step 6: Commit** — `git commit -m "feat(title): animated «Жду» button"`

---

### Task 10: «Жду» page, nav item, feed events

**Files:**

- Create: `apps/frontend/src/features/watchlist/watchlist-page.tsx`, `apps/frontend/src/features/watchlist/watchlist-view.ts`, `apps/frontend/src/features/watchlist/watchlist-view.test.ts`, `apps/frontend/src/routes/watchlist.tsx`
- Modify: `apps/frontend/src/shared/ui/navigation/navigation.tsx` (item «Жду», lucide `Hourglass`, `/watchlist`, after Films), `apps/frontend/src/features/home/home-page.tsx` (`TITLE_WATCH_EVENT_KEYS` + variants for the 3 new kinds: `add-failed` → error, others → success), i18n files

**Interfaces:**

- Consumes: `trpc.title.watchlist`, `title.watchlistRemove`, `title.watchlistCheck`, `title.setWatch` (pause/resume), `WatchlistItem` (Task 6).
- Produces (`watchlist-view.ts`):

  ```ts
  export type WatchlistStage =
  	"waiting" | "downloading" | "tracking" | "completed";
  export function stageOf(
  	item: Pick<WatchlistItem, "watch" | "transfer">,
  ): WatchlistStage; // waiting→waiting; downloading→downloading; tracking|paused with transfer.progress<1→downloading; tracking|paused→tracking; completed→completed
  export function groupByStage<
  	T extends Pick<WatchlistItem, "watch" | "transfer">,
  >(items: T[]): Record<WatchlistStage, T[]>; // order inside a group preserved
  ```

- [ ] **Step 1: Failing vitest** for `stageOf` (each mapping incl. tracking with progress 0.4 → downloading) and `groupByStage`.
- [ ] **Step 2: Run** — `cd apps/frontend && bunx vitest run src/features/watchlist/watchlist-view.test.ts` → FAIL.
- [ ] **Step 3: Implement helpers** → PASS.
- [ ] **Step 4: Page.** Heading, filter chips (Все + 4 stages with counts), list grouped by stage in order Качается → Жду → Слежу → Готово, edge-to-edge `List`/`ListItem` rows: poster thumb, name, kind/year/season, status line (downloading: progress bar, speed, ETA; waiting: outcome copy + `checkedAt`; tracking: episodes «N из M» + `lastChangedAt`), row menu (`checkNow`, `open` → `/title/$id`, `remove`, `pause`/`resume` for tracking/paused). Poll every 5 s while any item is downloading. Empty state `watchlist.empty`. Mobile-first via `useAppShellMobile`.
- [ ] **Step 5: Verify** — `cd apps/frontend && bunx tsc --noEmit && bun run check && bun run test && bun run build`.
- [ ] **Step 6: Commit** — `git commit -m "feat(watchlist): «Жду» page and navigation"`

---

### Task 11: Release notes and full verification

**Files:**

- Create: `changes/unreleased/<YYYYMMDD-HHMMSS>-watchlist.md` (`type: feature`): "Mark a film or series «Жду»: brotracker searches the trackers on a schedule, downloads the first release that matches your quality rules (Settings → Watchlist), and shows everything on the new Watchlist page."

- [ ] **Step 1: Write the note** (format `docs/agents/release-notes.md`).
- [ ] **Step 2: Run** — `bun run test && bun run lint && (cd apps/frontend && bunx tsc --noEmit && bun run test && bun run build)` → all pass.
- [ ] **Step 3: Commit** — `git commit -m "chore: release note for the watchlist"`
