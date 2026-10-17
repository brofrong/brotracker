# Title Matching and Titles (Part 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The title page lists only releases that really belong to the Title (name + year match), pushes the rest into a collapsed «Другие результаты» block, shows original and alternative names, searches by original or UI-locale name with the year, and works on phones.

**Architecture:** A pure release-title parser in `@brotracker/rutracker-ts` turns a tracker title into names + year (+ camrip/voice flags for part 2). A pure match function in the backend Title feature compares that against the Title's names (localized, original, Russian alternatives from TMDB) and year. `title.torrents` marks every item with `matches`; the frontend splits on it. The 1000-line `title-page.tsx` is split into hero and torrents files while their layouts gain a mobile branch.

**Tech Stack:** Bun, TypeScript, tRPC, `bun test` (backend, package), Vitest (frontend), React, TanStack Query, Astryx.

**Spec:** `docs/superpowers/specs/2026-10-17-watchlist-design.md` (section "Part 1 — Matching and titles").

## Global Constraints

- Astryx components and tokens only: no raw `<div>`/`<span>` layout, no `style={{…}}`, no hardcoded hex/px (`AGENTS.md`). Check props with `bunx astryx component <Name>` before use.
- Backend module rules `docs/adr/0001-module-boundaries.md`; frontend slices `docs/adr/0002-frontend-vertical-slices.md` (routes stay thin; no cross-feature imports).
- Match rule: whole-name equality after normalization (case-insensitive, ё→е, punctuation/extra spaces removed) AND year: films ±1; series (assistant's call) release year ≥ first-air year − 1. Release with unparseable year → no match. Title with unknown year → name check only.
- Russian alternative names = TMDB RU translation title + TMDB alternative titles with `iso_3166_1 === "RU"`, deduped by normalized form, excluding the main and original names.
- Film query = `<name> <year>`; series query = existing season query, no year.
- «Искать по» default `original`; persisted in `localStorage` key `brotracker.title.searchBy`.
- Copy (ru / en):
  - `title.detail.originalName`: «Оригинальное» / «Original title»
  - `title.detail.alsoKnownAs`: «Также известен как» / «Also known as»
  - `title.torrents.searchBy`: «Искать по» / «Search by»
  - `title.torrents.otherResults`: «Другие результаты — может быть не тот фильм ({{count}})» / «Other results — may be a different title ({{count}})»
  - `title.torrents.noExactMatches`: «Точных совпадений нет» / «No exact matches»
  - `title.torrents.downloadAria`: «Скачать {{title}}» / «Download {{title}}»
- JS regex `\b` is ASCII-only: Cyrillic tokens need Unicode boundaries, `(?<![\p{L}\p{N}])…(?![\p{L}\p{N}])` with the `u` flag.

## Review Focus

- Release whose year can't be parsed (scene names, broken formatting) → listed under «Другие результаты», never dropped. Test in Task 4.
- Title without TMDB metadata (`topic:` / `qb:` ids, TMDB down) → nothing to compare against; every result counts as a match (today's behaviour). Test in Task 4.
- Original name equals localized name (English UI + English film, or a Russian film) → toggle hidden, one query. Test in Task 6 (`hasDistinctNames`).
- Remake with the same name, different year («Дюна» 1984 vs 2021) → rejected by year. Test in Task 2.
- Series season release years after first air → still a match. Test in Task 2.

---

### Task 1: Release-title parser

**Files:**
- Create: `packages/rutracker-ts/src/tracker/release-title.ts`
- Test: `packages/rutracker-ts/test/unit/release-title.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type ParsedReleaseTitle = {
    names: string[];        // display names in title order, trimmed
    year: number | null;
    isCamrip: boolean;      // used in part 2
    hasRussianVoice: boolean; // used in part 2
  };
  export function parseReleaseTitle(title: string): ParsedReleaseTitle;
  ```
  Import path for consumers: `@brotracker/rutracker-ts/tracker/release-title`.

- [ ] **Step 1: Write the failing tests** (`describe("parseReleaseTitle")`, `it.each`-style table with `bun:test`)

  | input | names | year |
  |---|---|---|
  | `Одиссея / The Odyssey (Кристофер Нолан / Christopher Nolan) [2026, США, WEB-DL 2160p, HDR, Dub]` | `["Одиссея","The Odyssey"]` | 2026 |
  | `Космическая одиссея / 2001: A Space Odyssey (Стэнли Кубрик / Stanley Kubrick) [1968, Великобритания, США, BDRip 1080p] MVO` | `["Космическая одиссея","2001: A Space Odyssey"]` | 1968 |
  | `Одиссея / The Odyssey / 2026 / ДБ / WEB-DL (1080p)` (Kinozal) | `["Одиссея","The Odyssey"]` | 2026 |
  | `Космическая одиссея / 2001: A Space Odyssey / 1968 / ПМ / BDRip (1080p)` | `["Космическая одиссея","2001: A Space Odyssey"]` | 1968 |
  | `Одни из нас (2 сезон: 1-7 серии из 7) / The Last of Us / 2025 / ПМ / WEB-DL (1080p)` | `["Одни из нас","The Last of Us"]` | 2025 |
  | `Одни из нас / The Last of Us / Сезон: 2 / Серии: 1-7 из 7 (Крэйг Мазин) [2025, США, драма, WEB-DL 1080p] Dub + Original` | `["Одни из нас","The Last of Us"]` | 2025 |
  | `Одиссея / The Odyssey (2026) WEB-DLRip-AVC от DoMiNo & селезень \| D` (RuTor) | `["Одиссея","The Odyssey"]` | 2026 |
  | `Inception 2010 1080p` | `["Inception"]` | 2010 |
  | `Padre.Pio.2022.WEB-DL.1080p.mkv` | `["Padre Pio"]` | 2022 |
  | `Какой-то релиз без года WEB-DL` | `["Какой-то релиз без года WEB-DL"]` | `null` |

  Flags:
  - `isCamrip` true: `Одиссея / The Odyssey (2026) CAMRip | Звук с TS`, `… [2026, HDCAM]`, `… [2026, TS] …`, `… экранка …`; false: `… [2010, BDRip 1080p, DTS-HD MA]`, `… [2026, WEB-DL 1080p]`.
  - `hasRussianVoice` true: rows 1–7 above (Dub, MVO, ДБ, ПМ, `| D`), `… [2024, BDRip] Дубляж`, `… Многоголосый закадровый`; false: `… [2026, WEB-DL 1080p] Original + Sub`, `… [2024, BDRip] AVO`, `Ампм / Ampm [2024, WEB-DL]`.

- [ ] **Step 2: Run to verify failure**

  Run: `cd packages/rutracker-ts && bun test test/unit/release-title.test.ts`
  Expected: FAIL, module `release-title` not found.

- [ ] **Step 3: Implement `parseReleaseTitle(title: string): ParsedReleaseTitle`**

  Algorithm (the tests don't fully pin the order, so follow it):
  1. **Year:** first `(19|20)\d{2}` inside the first `[…]`; else a `(YYYY)` group in the text before `[`; else the first ` / `-segment that is exactly a year or a year range (`2025-2026` → 2025); else (fallback) the first standalone year in the whole title.
  2. **Name head:** text before the earliest of: first `[`, the `(YYYY)` group from step 1, first `|`. For the fallback case, text before the found year with `.`/`_` turned into spaces.
  3. Remove remaining `(...)` groups, then split on ` / `; stop at the first segment that is a year/year range; drop segments starting with `Сезон`, `Серии`, `Серия`, `Season`, `Episode(s)`, `S\d+`; trim; drop empties.
  4. **Flags:** case-sensitive `CAM|CAMRip|CamRip|HDCAM|TS|HDTS|TeleSync|TC|HDTC|TeleCine` as whole tokens, or `/экранк/i`. Voice: `Dub|Дубляж|ДБ|MVO|ПМ|Многоголос\p{L}*` as whole tokens (Unicode boundaries, see Global Constraints), or RuTor `\|\s*[DP]\b` suffix. AVO/DVO/Sub/Original alone don't count.

- [ ] **Step 4: Run to verify pass**

  Run: `cd packages/rutracker-ts && bun test test/unit/release-title.test.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add packages/rutracker-ts/src/tracker/release-title.ts packages/rutracker-ts/test/unit/release-title.test.ts
  git commit -m "feat(tracker): parse names, year and quality flags from release titles"
  ```

---

### Task 2: Title ↔ release match

**Files:**
- Create: `apps/backend/src/title/release-match.ts`
- Test: `apps/backend/src/title/release-match.test.ts`
- Modify: `CONTEXT.md` (add **Release match** under "Titles & metadata": "Whether a tracker release belongs to a Title: one release name equals one Title name after normalization, and the year fits. _Avoid_: fuzzy match, similarity.")

**Interfaces:**
- Consumes: `ParsedReleaseTitle` (Task 1).
- Produces:
  ```ts
  export function normalizeTitleName(name: string): string;
  export type MatchTarget = { kind: TitleKind; year: number | null; names: string[] };
  export function releaseMatchesTitle(
    release: Pick<ParsedReleaseTitle, "names" | "year">,
    target: MatchTarget,
  ): boolean;
  ```

- [ ] **Step 1: Write the failing tests**

  - `normalizeTitleName("Проект «Конец света»!")` → `"проект конец света"`; `normalizeTitleName("Ёлки  2")` → `"елки 2"`.
  - Target `{kind:"films", year:2026, names:["Одиссея","The Odyssey"]}`:
    - `{names:["Одиссея","The Odyssey"], year:2026}` → true; year 2027 → true; 2025 → true; 2028 → false.
    - `{names:["Космическая одиссея","2001: A Space Odyssey"], year:1968}` → false.
    - `{names:["Космическая одиссея","2001: A Space Odyssey"], year:2026}` → false (name).
    - `{names:["The Odyssey"], year:2026}` → true (original only).
    - `{names:["Одиссея"], year:null}` → false.
  - Remake: target `{kind:"films", year:2021, names:["Дюна","Dune"]}` vs `{names:["Дюна","Dune"], year:1984}` → false.
  - Alt name: target names `["Елки","Ёлки 1914"]` vs release `["ёлки 1914"]` year in range → true.
  - Series: target `{kind:"tv", year:2023, names:["Одни из нас","The Last of Us"]}` vs year 2025 → true; 2022 → true; 2021 → false.
  - Unknown target year: `{kind:"films", year:null, names:["Одиссея"]}` vs `{names:["Одиссея"], year:1999}` → true.

- [ ] **Step 2: Run to verify failure**

  Run: `cd apps/backend && bun test src/title/release-match.test.ts`
  Expected: FAIL, module not found.

- [ ] **Step 3: Implement `normalizeTitleName` and `releaseMatchesTitle` in `release-match.ts`**

  Normalize: lowercase, `ё`→`е`, replace runs of `[^\p{L}\p{N}]` with one space (`u` flag), trim. Year rules per Global Constraints.

- [ ] **Step 4: Run to verify pass**

  Run: `cd apps/backend && bun test src/title/release-match.test.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add apps/backend/src/title/release-match.ts apps/backend/src/title/release-match.test.ts CONTEXT.md
  git commit -m "feat(title): match tracker releases to a Title by name and year"
  ```

---

### Task 3: Original and Russian alternative names from TMDB

**Files:**
- Modify: `apps/backend/src/title/tmdb-meta.ts` (detail types, `parseMovieDetails`, `parseTvDetails`)
- Modify: `apps/backend/src/title/fetch-tmdb-meta.ts` (details path)
- Modify: `apps/backend/src/title/title.types.ts` (`TmdbMeta`, `TitleMeta`)
- Modify: `apps/backend/src/title/title.ts` (`emptyMeta`, `metaFromTmdb`)
- Test: `apps/backend/src/title/tmdb-meta.test.ts` (create)

**Interfaces:**
- Consumes: `normalizeTitleName` (Task 2).
- Produces: `TmdbMeta` and `TitleMeta` gain `originalName: string | null` and `alternativeNames: string[]` (empty in `emptyMeta`). Frontend sees them on `title.get` via tRPC inference.

- [ ] **Step 1: Write the failing tests** (`describe("parseMovieDetails names")`, `describe("parseTvDetails names")`)

  - Movie details `{ title:"Одиссея", original_title:"The Odyssey", alternative_titles:{titles:[{iso_3166_1:"RU",title:"Одиссей"},{iso_3166_1:"RU",title:"одиссея"},{iso_3166_1:"US",title:"Odyssey"}]}, translations:{translations:[{iso_639_1:"ru",iso_3166_1:"RU",data:{title:"Одиссея Нолана"}}]} }` → `originalName: "The Odyssey"`, `alternativeNames: ["Одиссея Нолана","Одиссей"]` (translation first, dupes of the main name and non-RU dropped).
  - Same movie fetched in English (`title:"The Odyssey"`, RU translation `"Одиссея"`) → `alternativeNames` contains `"Одиссея"`, not `"The Odyssey"`.
  - TV details use `name`, `original_name`, `alternative_titles.results`, `translations.translations[].data.name` → same behaviour.
  - Missing `alternative_titles`/`translations`/`original_title` → `originalName: null`, `alternativeNames: []`.

- [ ] **Step 2: Run to verify failure**

  Run: `cd apps/backend && bun test src/title/tmdb-meta.test.ts`
  Expected: FAIL (fields undefined).

- [ ] **Step 3: Implement**

  - Add to the detail types: `original_title?`/`original_name?`, `alternative_titles?: { titles?: TmdbAltTitle[]; results?: TmdbAltTitle[] }`, `translations?: { translations?: TmdbTranslation[] }`.
  - Add `russianAlternativeNames(input: { mainName: string; originalName: string | null; translationName: string | null; altTitles: TmdbAltTitle[] }): string[]` in `tmdb-meta.ts` (rule in Global Constraints) and use it from both parse functions.
  - `fetch-tmdb-meta.ts`: details path `/${segment}/${tmdbId}?append_to_response=alternative_titles,translations` (`fetchTmdbJson` already handles an existing `?`).
  - Thread the two fields through `TmdbMeta`, `TitleMeta`, `emptyMeta`, `metaFromTmdb`; update the `TmdbMeta` fixtures in `title*.test.ts` so the backend suite type-checks.

- [ ] **Step 4: Run to verify pass**

  Run: `cd apps/backend && bun test src/title`
  Expected: PASS (new and existing title tests).

- [ ] **Step 5: Commit**

  ```bash
  git add apps/backend/src/title
  git commit -m "feat(title): load original and Russian alternative names from TMDB"
  ```

---

### Task 4: Mark title torrents as matching or not

**Files:**
- Modify: `apps/backend/src/title/title.types.ts` (`TitleTorrent`)
- Modify: `apps/backend/src/title/title.ts` (`toTitleTorrent`, `torrents`)
- Test: `apps/backend/src/title/title-torrents.test.ts`

**Interfaces:**
- Consumes: `parseReleaseTitle` (Task 1), `releaseMatchesTitle`, `MatchTarget` (Task 2), `TitleMeta.originalName/alternativeNames` (Task 3).
- Produces: `TitleTorrent.matches: boolean` on every item of `title.torrents`. Sorting stays by `qualityScore`.

- [ ] **Step 1: Write the failing tests** (in `describe("title.torrents")`)

  - `marks releases of other titles as not matching`: meta `{name:"Одиссея", originalName:"The Odyssey", alternativeNames:[], year:2026, kind:"films"}`; tracker returns `Одиссея / The Odyssey [2026, WEB-DL 1080p]` and `Космическая одиссея / 2001: A Space Odyssey [1968, BDRip 1080p]` → `matches` `true` and `false` respectively, both items present.
  - `release without a parseable year is kept but not matching`: `Одиссея WEB-DL 1080p` → present, `matches: false`.
  - `everything matches when the title has no metadata`: id `qb:abc` (or `fetchTmdbMeta` → `{status:"error"}`), query override `"Одиссея"` → all items `matches: true`.
  - Existing tests (`Inception 2010 1080p` vs Inception/2010) still pass with `matches: true`.

- [ ] **Step 2: Run to verify failure**

  Run: `cd apps/backend && bun test src/title/title-torrents.test.ts`
  Expected: FAIL (`matches` undefined).

- [ ] **Step 3: Implement**

  In `torrents()`: build `MatchTarget` from the fetched title (`names` = `[meta.name, meta.originalName, ...meta.alternativeNames]` without nulls/empties, `year` = `meta.year`, `kind` = `facet ?? "films"`). If `names` is empty, every item gets `matches: true`. Otherwise `matches = releaseMatchesTitle(parseReleaseTitle(candidate.title), target)`. Pass `matches` through `toTitleTorrent`.

- [ ] **Step 4: Run to verify pass**

  Run: `cd apps/backend && bun test src/title`
  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add apps/backend/src/title
  git commit -m "feat(title): flag torrents that may belong to a different title"
  ```

---

### Task 5: Title hero — names and mobile layout

**Files:**
- Create: `apps/frontend/src/features/title/title-hero.tsx` (move `TitleHero`, its props type and helpers it alone uses out of `title-page.tsx`, unchanged first)
- Modify: `apps/frontend/src/features/title/title-page.tsx` (import the moved component)
- Modify: `apps/frontend/src/shared/i18n/locales/ru.json`, `en.json` (`title.detail.originalName`, `title.detail.alsoKnownAs`)

**Interfaces:**
- Consumes: `meta.originalName`, `meta.alternativeNames` from `title.get` (Task 3); `useAppShellMobile` from `@astryxdesign/core/AppShell` (same hook as `shared/ui/navigation/navigation.tsx`).
- Produces: `export function TitleHero(props: TitleHeroProps)` in `title-hero.tsx`. `TitleHeroProps` unchanged except it now reads the two new meta fields.

- [ ] **Step 1: Move `TitleHero` to `title-hero.tsx` without behaviour changes**

- [ ] **Step 2: Verify the move**

  Run: `cd apps/frontend && bunx tsc --noEmit && bun run check`
  Expected: no errors.

- [ ] **Step 3: Commit the move**

  ```bash
  git add apps/frontend/src/features/title
  git commit -m "refactor(title): move title hero into its own file"
  ```

- [ ] **Step 4: Add the names block**

  Under the badges/year line: `originalName` row («Оригинальное: …») when it is set and differs from `meta.name` (case-insensitive); «Также известен как: a · b» when `alternativeNames` is non-empty. `Text type="supporting"` for labels.

- [ ] **Step 5: Add the mobile branch** (`const { isMobile } = useAppShellMobile()`)

  Mobile: poster at a smaller token width beside the title block (`HStack vAlign="end"`), then the names block, the ratings in one row, overview clamped to 3 lines with an «Ещё» toggle (find the clamp prop via `bunx astryx component Text`). Desktop stays as now. The page backdrop already exists (`title-page.tsx`, `meta.backdrop`); keep it.

- [ ] **Step 6: Verify**

  Run: `cd apps/frontend && bunx tsc --noEmit && bun run check`, then open a title page (run skill / `bun run dev`) at 390px and 1280px width: names visible, nothing overflows horizontally on 390px.
  Expected: clean checks; screenshots at both widths.

- [ ] **Step 7: Commit**

  ```bash
  git add apps/frontend/src
  git commit -m "feat(title): show original and alternative names, mobile hero layout"
  ```

---

### Task 6: Title torrents — search by, year, other results, mobile rows

**Files:**
- Create: `apps/frontend/src/features/title/torrent-search.ts`
- Test: `apps/frontend/src/features/title/torrent-search.test.ts`
- Create: `apps/frontend/src/features/title/title-torrents.tsx` (move `TitleTorrentsList` out of `title-page.tsx`, unchanged first)
- Modify: `apps/frontend/src/features/title/title-page.tsx`
- Modify: `apps/frontend/src/shared/i18n/locales/ru.json`, `en.json` (`title.torrents.searchBy`, `otherResults`, `noExactMatches`, `downloadAria`)

**Interfaces:**
- Consumes: `TitleTorrent.matches` (Task 4); `meta.originalName`, `meta.year` (Task 3).
- Produces (in `torrent-search.ts`):
  ```ts
  export type SearchBy = "original" | "locale";
  export const SEARCH_BY_STORAGE_KEY = "brotracker.title.searchBy";
  export function hasDistinctNames(meta: { name: string | null; originalName: string | null }): boolean;
  export function searchNameFor(by: SearchBy, meta: { name: string | null; originalName: string | null }): string;
  export function buildTitleSearchQuery(input: {
    name: string; year: number | null; season: number | null;
    formatSeason: (name: string, season: number) => string;
  }): string;
  export function splitByMatch<T extends { matches: boolean }>(items: T[]): { matched: T[]; others: T[] };
  export function loadSearchBy(storage: Pick<Storage, "getItem">): SearchBy;
  export function saveSearchBy(storage: Pick<Storage, "setItem">, by: SearchBy): void;
  ```
  `TitleTorrentsList` additionally receives `originalName: string | null` and `year: number | null` props from `title-page.tsx`.

- [ ] **Step 1: Write the failing tests** (Vitest, `describe` per function)

  - `hasDistinctNames({name:"Одиссея", originalName:"The Odyssey"})` → true; `{name:"The Odyssey", originalName:"the odyssey"}` → false; `{name:"Одиссея", originalName:null}` → false.
  - `searchNameFor("original", {name:"Одиссея", originalName:"The Odyssey"})` → `"The Odyssey"`; `"locale"` → `"Одиссея"`; `"original"` with `originalName:null` → `"Одиссея"`.
  - `buildTitleSearchQuery({name:"The Odyssey", year:2026, season:null, formatSeason})` → `"The Odyssey 2026"`; `year:null` → `"The Odyssey"`; `season:2` with `formatSeason=(n,s)=>\`${n} сезон ${s}\`` → `"The Odyssey сезон 2"` (no year).
  - `splitByMatch` keeps order inside each group.
  - `loadSearchBy` → `"original"` for missing or garbage values, `"locale"` when stored; `saveSearchBy` writes `SEARCH_BY_STORAGE_KEY`.

- [ ] **Step 2: Run to verify failure**

  Run: `cd apps/frontend && bunx vitest run src/features/title/torrent-search.test.ts`
  Expected: FAIL, module not found.

- [ ] **Step 3: Implement `torrent-search.ts`**

- [ ] **Step 4: Run to verify pass**

  Run: `cd apps/frontend && bunx vitest run src/features/title/torrent-search.test.ts`
  Expected: PASS.

- [ ] **Step 5: Move `TitleTorrentsList` to `title-torrents.tsx` without behaviour changes, verify (`bunx tsc --noEmit && bun run check`), commit**

  ```bash
  git add apps/frontend/src/features/title
  git commit -m "refactor(title): move torrents list into its own file"
  ```

- [ ] **Step 6: Wire the UI**

  - `SegmentedControl` «Искать по» with the two names as item labels, shown only when `hasDistinctNames`; initial value `loadSearchBy(localStorage)`; on change save and rebuild the query (same path as the season change). Initial query uses `buildTitleSearchQuery` with `year` for films (`isTv` → `year: null`).
  - Render `splitByMatch(items)`: matched list as now; if `matched` is empty but `others` isn't, a supporting line «Точных совпадений нет»; `others` inside a closed-by-default `Collapsible` titled `otherResults` with the count, same row component inside.
  - Mobile rows (`useAppShellMobile`): title clamped to 2 lines, badges + tracker · size · seeds under it, icon-only download `Button` with `aria-label` = `downloadAria`; «Искать по» and the query field full width.

- [ ] **Step 7: Verify**

  Run: `cd apps/frontend && bunx tsc --noEmit && bun run check && bun run test`, then in the running app open «Одиссея» (or any title with a well-known older namesake) at 390px and 1280px: toggle switches the query between original and Russian with the year, unrelated releases sit in the collapsed block, the choice survives opening another title.
  Expected: clean checks; screenshots at both widths.

- [ ] **Step 8: Commit**

  ```bash
  git add apps/frontend/src
  git commit -m "feat(title): search by original or local name with year, hide likely wrong releases"
  ```

---

### Task 7: Release notes and full verification

**Files:**
- Create: `changes/unreleased/<YYYYMMDD-HHMMSS>-title-matching.md` (`type: fix`): "The title page no longer mixes in releases of other films with a similar name (e.g. «Космическая одиссея» on «Одиссея»); they are tucked into a collapsed «Other results» block."
- Create: `changes/unreleased/<YYYYMMDD-HHMMSS>-title-names-search.md` (`type: feature`): "Title pages show the original and alternative titles, search by original or local title with the release year, and have a proper mobile layout."

- [ ] **Step 1: Write both notes** (format: `docs/agents/release-notes.md`)

- [ ] **Step 2: Run everything**

  Run: `bun run test && bun run lint && (cd apps/frontend && bunx tsc --noEmit && bun run test && bun run build)`
  Expected: all pass, build succeeds.

- [ ] **Step 3: Commit**

  ```bash
  git add changes/unreleased
  git commit -m "chore: release notes for title matching"
  ```
