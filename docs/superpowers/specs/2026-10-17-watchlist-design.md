# Watchlist («Жду»), accurate title matching, notifications

Date: 2026-10-17
Status: draft (awaiting approval)

## Intent

The user wants to mark a film or series as «жду» (waiting for it) and forget about it: when a release
in *good enough* quality shows up on a tracker, brotracker should start downloading it in qBittorrent
on its own and tell the user it started. "Good enough" is the user's own rule, set in Settings.

This only works if brotracker reliably knows which releases belong to which Title. Today it doesn't:
opening «Одиссея» (2026) lists «Космическая одиссея» (1968), because the title page searches trackers
by the Russian name alone and shows whatever comes back. Auto-download on top of that would grab the
wrong film. So accurate matching comes first, and it also fixes the everyday title page.

The user also asked for: alternative and original titles on the title page, searching by original
title (default) or by the UI-language title, the year in the query, a proper mobile layout for the
title page, and a "juicy" animation on the «Жду» button.

## Delivery: three parts, one release each, in this order

1. **Matching and titles.** Release-title parsing, Title↔release match check, «Другие результаты»
   block, original and alternative titles, search by original/locale title with the year, mobile
   title page.
2. **Unified watch and «Жду».** One watch lifecycle for films and series, quality rules in Settings,
   the «Поиск ожидаемых» worker, auto-add to qBittorrent, the «Жду» page, the «Жду» button with
   animation.
3. **Notifications.** In-app notification center (bell) and browser Web Push.

Each part is useful on its own. Part 2 depends on part 1's match check; part 3 builds on part 2's
events.

## Goals

- A release is only auto-downloaded if it provably belongs to the Title (title + year match).
- The user sets the quality bar once; brotracker takes the **first** matching release and stops
  searching for that Title.
- Films and series share one watch model; the existing series-update tracking keeps working.
- The user learns about starts, completions, series updates and failures without opening the app.
- The title page, the «Жду» page and the notification center work well on a phone.

## Non-goals

- Upgrading a downloaded release when a better one appears later (user chose "take the first match
  and stop").
- Max size limit in quality rules (user: "не вижу смысла").
- External notification channels (Telegram, ntfy, webhook, Apprise, email). Discussed; user chose
  browser push + in-app center only. Keep the sending side behind a small interface so channels can
  be added later, but build none now.
- OMDb / Rotten Tomatoes / real IMDb ratings. User wants Rotten Tomatoes instead of Kinopoisk
  eventually ("давай потом"). Out of scope; ratings stay as they are (only TMDB is live, IMDb and
  Kinopoisk are stubs).
- Mobile redesign of pages other than the title page, the «Жду» page and the notification center.
- An admin area. The project has none; configuration goes into Settings.

## Anti-goals (failure even if it "works")

- Auto-downloading the wrong film (a substring/similar-name hit, a different year).
- Auto-downloading a CAMRip/TS/TC.
- Silently hiding releases the parser couldn't understand — they go into «Другие результаты», not
  into the void.
- Breaking the existing nightly series-update flow or the home feed.

## Constraints

- Follow `AGENTS.md`: Astryx components and tokens only, no raw `<div>`, no hardcoded px/hex.
- Backend module rules: `docs/adr/0001-module-boundaries.md` (watch stays under `title/watch/`,
  workers invoke it via ports). Frontend slices: `docs/adr/0002-frontend-vertical-slices.md`.
- Domain vocabulary: `CONTEXT.md` (TitleWatch, WatchTask, TitleWatchEvent, Worker). Update it with
  any new terms (e.g. the waiting stage, notification read state, push subscription).
- Trackers: RuTracker, Kinozal, RuTor. RuTor has request pacing; the waiting worker must go through
  the same search path and not hammer trackers.
- Release notes per part in `changes/unreleased/`; release via the release skill.
- Web Push requires HTTPS (or localhost). On iOS it only works when the site is added to the Home
  Screen — say so in the UI near the enable button.
- Respect `prefers-reduced-motion` for the «Жду» animation.

---

## Part 1 — Matching and titles

### What the parser knows today

`checkResolution` (`packages/rutracker-ts/src/tracker/search-engine/rutracker/format.ts`) returns
`4K` (`4k`/`2160p`), `1080p`, `720p`, else `null` (`SD` exists in the type but is never returned).
`checkHDR` detects `HDR10`, `HDR10+`, `Dolby Vision`. Nothing detects screen recordings or Russian
voice-over yet. Kinozal and RuTor reuse the RuTracker helpers.

### Release-title parsing (new)

Parse each tracker release title into: list of names, year, and flags. Typical shapes:

- RuTracker: `Одиссея / The Odyssey (Кристофер Нолан) [2026, США, WEB-DL 2160p, HDR, Dub]`
- Kinozal / RuTor: `Одиссея / The Odyssey / 2026 / ДБ / WEB-DL (1080p)`

Output per release: `names: string[]` (split on ` / `, director parentheses and bracket tail
removed), `year: number | null`, plus new flags:

- `isCamrip`: CAMRip, CamRip, TS, TeleSync, TC, TeleCine, «экранка» and common spellings.
- `hasRussianVoice`: Dub, Дубляж, ДБ, MVO, Многоголосый, ПМ/профессиональный многоголосый, and
  similar. Exact token list is the builder's call; cover the three trackers' conventions and test
  with real titles.

Where this lives (tracker package vs backend) is the builder's call; it must be pure and unit-tested
against real titles from all three trackers.

### Title↔release match check (new)

A release **matches** a Title when both hold:

1. **Name:** at least one parsed release name equals one of the Title's names — the TMDB localized
   name, the original name, and the Russian alternative titles. Comparison is on whole names after
   normalization: case-insensitive, ё→е, punctuation and extra spaces removed. Not substring:
   «Космическая одиссея» ≠ «Одиссея».
2. **Year:** release year within ±1 of the Title's year.

A release that fails either (including when its year or names can't be parsed) is "may be a
different film".

For series, the year check needs care: a season release carries the season's year, not the first
air year. Builder decides the series rule (e.g. accept any year between first air year and last air
year + 1, or skip the year check for `tv` and rely on name). Document the choice.

### Title metadata

Extend the TMDB fetch (`apps/backend/src/title/fetch-tmdb-meta.ts`, `tmdb-meta.ts`) with:

- `originalName` (TMDB `original_title` / `original_name`).
- `alternativeNames`: Russian alternative titles from TMDB (`alternative_titles` filtered to RU,
  plus the RU translation title if it differs). Dedupe, drop the main name.

Use `append_to_response` to avoid extra round trips.

### Title page (desktop)

- Under the title/meta line: «Оригинальное: The Odyssey» and «Также известен как: …» (all Russian
  alternatives). Hide rows that would be empty or duplicate the main name.
- Torrents section gets a segmented control «Искать по»: **original title** (default) / **UI-locale
  title**. The choice is remembered (localStorage) across titles.
- The query field is prefilled with `<chosen name> <year>` for films. For series, no year (the
  season selector already shapes the query). The field stays editable as today.
- Results show only the chosen query's results (no merging on the page).
- Matching releases are listed as now. Non-matching ones go into a collapsed block at the bottom:
  «Другие результаты — может быть не тот фильм (N)».
- When the user edits the query by hand, still apply the match check (matching on top, others
  collapsed).

### Title page (mobile)

Today the hero is a non-wrapping row with a 208px poster, which breaks on phones. On narrow screens:

- Backdrop image on top, smaller poster overlapping it, title + badges + year/runtime beside the
  poster.
- Original/alternative names below, then the «Жду» button full width (button arrives in part 2),
  then ratings as tiles in one row, overview clamped to 3 lines with «Ещё».
- Torrents: «Искать по» full width, query field, rows with the release title on up to 2 lines, tags
  and meta (tracker · size · seeds) under it, a square download button on the right.
- Cast and similar stay as horizontal carousels.

The approved mockup is in the brainstorming conversation; Astryx components and tokens are the
source of truth for implementation.

---

## Part 2 — Unified watch and «Жду»

### Today

`apps/backend/src/title/watch/`: a TitleWatch is keyed by `topicUrl` (an existing download). The
nightly worker (03:00–05:00) re-fetches the topic; if the .torrent changed (new episodes), it
replaces it in qBittorrent and records a `torrent-updated` TitleWatchEvent. Full packs become
`completed`. Events feed the home widget. States: `tracking | paused | completed | off`.

### One watch, several stages

Unify films and series into one TitleWatch with a lifecycle:

| Stage | Meaning | Films | Series |
|---|---|---|---|
| **Жду** (new) | no release yet; searched periodically | ✅ | ✅ |
| **Качается** | release found and added to qBittorrent | ✅ | ✅ |
| **Слежу за обновлениями** | existing nightly topic-update tracking | — | ✅ |
| **Готово** | film downloaded / series pack complete | ✅ | ✅ |

- A watch is anchored to the **Title**; the topic is attached once found. This needs a migration of
  `title_watches` (today `topic_url` is the primary key). Existing rows must be preserved and keep
  working.
- Existing `paused`/`off` semantics stay for series tracking.
- Stage and state naming in code is the builder's call; update `CONTEXT.md`.

### «Поиск ожидаемых» worker (new)

- Runs every N hours, N from Settings (default **24**). Registered like the nightly worker so it
  gets run history and a manual run on the existing Workers page; the nightly worker stays as is.
- For each watch in **Жду**: search trackers with both the original-title and the Russian-title
  queries (with year for films), merge and dedupe results, keep only releases that pass the match
  check, then apply the quality rules. If any pass, take the best by the existing
  `scoreTorrentQuality`, add it to qBittorrent via the existing add-from-tracker path (with the
  topic tag), move the watch to **Качается**, record a «начал качаться» event.
- For series in **Жду**: take the first matching season release, same as films, and then hand it
  over to the existing update tracking (**Слежу**). Which season to wait for: the latest
  announced/airing season by default (builder's call; show it on the item).
- If nothing passes, record the outcome on the watch so the UI can say why: «Раздач пока нет»,
  «Есть только экранка — пропущена», «Есть только 720p — ниже порога», «Нет русской озвучки».
- Failures (tracker down, qBittorrent unreachable) are recorded as events and retried next run.

### Download completion

Films: when qBittorrent reports the torrent complete, move the watch to **Готово** and record a
«скачан» event. Series: existing logic (complete pack → completed). Detection mechanism (qb poller,
sync step) is the builder's call.

### Quality rules — Settings → «Жду» (new section)

New `/settings/watchlist` (name is the builder's call) in the settings registry:

- **Проверять каждые:** 1 / 2 / 4 / 6 / 12 / 24 часа — default **24**.
- **Минимальное разрешение:** 720p / 1080p / 4K (the values the parser produces). Releases with
  unknown resolution (`null`) do **not** pass.
- **Только HDR:** да / нет.
- **Нужна русская озвучка:** да / нет.
- Screen recordings (CAMRip/TS/TC) are always rejected; no toggle.

Defaults for the three quality rules are the builder's call (suggest 1080p, no HDR requirement,
voice required).

### «Жду» button on the title page

- Toggles the Title in/out of the watchlist. States: «☆ Жду» → «⏳ Жду». When the watch is past
  **Жду**, show its stage instead (e.g. «Качается 62%», «Готово»).
- Animation on add: button squeezes and springs back, a burst of small colored sparks, an expanding
  ring, a short vibration on devices that support it (`navigator.vibrate`), label morphs to
  «⏳ Жду», and a hint appears under it: «Проверю трекеры …· 1080p+, с озвучкой» (reflecting the
  user's rules and next run). Reduced-motion users get the state change without motion. Build with
  Astryx motion tokens where possible.

### «Жду» page (new route, e.g. `/watchlist`)

- Nav item «Жду» in the side nav and the mobile nav.
- Filter chips: Все / Жду / Качается / Слежу / Готово, with counts.
- List grouped by stage. Row: poster thumbnail, title, kind/year/season, a status line:
  - Качается: quality, tracker, progress bar, speed, ETA.
  - Жду: last check result (see worker), «проверено …» time.
  - Слежу: «Сезон 3 · 5 из 8 серий · обновлено вчера».
- Row menu «⋯»: «Проверить сейчас», «Открыть фильм», «Убрать»; for series in Слежу also «Пауза».
- **Готово** items stay until the user removes them.
- Mobile-first layout (list rows, edge to edge); desktop uses the same list wider.

---

## Part 3 — Notifications

### Events

Notifications are TitleWatchEvents (extend the kinds) plus a read flag:

- «начал качаться» (with quality and size),
- «скачан»,
- «новые серии» (existing `torrent-updated`),
- «не удалось добавить / проверить» (with the reason).

Keep the event→notification mapping in one place so new channels can be added later. Retain events
for **90 days**. The home feed keeps working.

### In-app notification center

- Bell in the app header with an unread count.
- Desktop: dropdown panel. Mobile: full-height sheet.
- List newest first; unread items highlighted; tap opens the Title page and marks the item read;
  «Прочитать все».
- A card at the bottom: «Получать push в этом браузере, даже когда сайт закрыт» + «Включить»
  (also available in Settings, see below).

### Browser Web Push

- Server keeps VAPID keys (generate on first boot and persist, like the Better Auth secret in
  `app_settings`).
- Settings gets a «Уведомления» block (in the «Жду» section or its own section — builder's call)
  with «Включить push в этом браузере» / «Выключить», a test button, and the iOS note.
- Store push subscriptions per browser; remove dead ones on 404/410.
- Every notification event is also pushed. Clicking the push opens the Title page.
- Needs a service worker; the app already ships `manifest.json`.

---

## Decided by the assistant (user can override)

- Everything is shared, not per user, like the rest of the app today (no table besides auth has a
  user id): one watchlist, one notification list with one read state. Push subscriptions are per
  browser.
- Show all Russian alternative titles, deduped, main name excluded.
- «Искать по» choice persists across titles.
- No year in the series query.
- Title page shows the chosen query's results only; the waiting worker merges both queries.
- Waiting-stage outcome text on each «Жду» item.
- «Готово» items stay until removed.
- Push for all notification events; 90-day retention.
- Bell: dropdown on desktop, sheet on mobile.
- Settings section name and route; default quality rules.

## Left to the builder

- Where the release parser lives and its exact token lists.
- Series year rule in the match check; which season a series watch waits for.
- Watch schema migration shape and code names for stages.
- Completion detection mechanism for films.
- Web Push library and service-worker setup.
- How the worker interval setting is stored and applied without a restart.

## Carry-overs from part 1 (for the part 2 plan)

- `hasRussianVoice` currently counts RuTor `| P1` / `| P2` (one-/two-voice) and amateur multi-voice; the user's rule is dub or professional multi-voice only. Tighten before auto-download uses the flag, against a fixture file of real tracker titles.
- `[1920×1080, …]` (Unicode `×`) can be read as year 1920. Cover in the same fixtures.
- The title-page query includes the year; the waiting worker should also query without the year (or ±1) so a premiere-year mismatch doesn't hide releases the ±1 matcher would accept.
