# BroTracker

Self-hosted torrent search and download helper: search enabled torrent trackers (RuTracker, Kinozal), cache locally, resolve Title metadata, and watch downloads in qBittorrent.

## Language

### Catalog & search

**Catalog**:
The local-first search surface over cached torrents, with live tracker refresh when needed.
_Avoid_: Search service, torrent search module (when meaning the orchestration layer)

**Torrent** (cached row):
A persisted tracker hit (topic, title text, size, seeds, quality signals) stored for local search and covers.
_Avoid_: Download, transfer (those are qBittorrent runtime state)

**Topic**:
A tracker-side torrent listing identified by topic URL / namespaced torrent id (`rutracker:…` / `kinozal:…`).
_Avoid_: Thread, post

### Titles & metadata

**Title**:
A watchable work the user cares about (film or TV), addressed by a Title ref (`tmdb:`, `topic:`, or `qb:`).
_Avoid_: Movie, show, media item (use Title; use `films` | `tv` for kind)

**Title kind**:
Either `films` or `tv`.
_Avoid_: movie/series as type names in code

**TitleWatch**:
The user's follow/tracking link between a Title and a Topic / qBittorrent torrent.
_Avoid_: Follow, subscription (except UI copy)

**WatchTask**:
A queued unit of work to check a TitleWatch for a newer/better Topic release.
_Avoid_: Job, cron item (say WatchTask)

**TitleWatchEvent**:
A recorded outcome from a watch check (found, replaced, unchanged, failed).
_Avoid_: Log line, notification (domain event first)

### Workers

**Worker**:
A registered background process (e.g. nightly Topic/TitleWatch checker) with optional manual trigger and durable run history.
_Avoid_: Job, cron (as the UI/API entity name)

**WorkerRun**:
One persisted execution of a Worker (`scheduled` or `manual`), with status, summary, and leveled log lines.
_Avoid_: Job run, cron execution (prefer WorkerRun)

### Downloads

**Transfer**:
Live qBittorrent download/session state (progress, speeds, pause).
_Avoid_: Torrent (when meaning runtime qb state — use Transfer)

**Provider**:
A configured external system: RuTracker, Kinozal, qBittorrent, TMDB (credentials, proxy, enabled flag where applicable).
_Avoid_: Integration, connector
