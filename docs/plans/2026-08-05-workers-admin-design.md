# Workers admin UI

Date: 2026-08-05  
Status: approved

## Goal

Admin page to list background workers, inspect durable run history with leveled logs, and manually trigger a worker. v1 exposes only the nightly torrent/Topic checker; the UI and backend registry are shaped for multiple workers later.

## Decisions

| Topic | Choice |
|--------|--------|
| Scope (v1) | Only `nightly-torrent-check`; multi-worker list UI ready |
| Persistence | Postgres `worker_runs` (survives process restart) |
| Logs | `jsonb` array of `{ ts, level, message }`; levels `info` \| `warn` \| `error` |
| Manual run while busy | Disable Run; core rejects second concurrent run |
| Empty scheduled ticks | No run row when nightly window / once-per-day gate skips work |
| Failed WatchTasks | Log warn/error per task; overall run can still `succeeded` with summary |
| Live updates | Poll while status is `running` (no websocket in v1) |
| Retention | Keep last 50 runs per worker; prune on new run |
| Routes | `/workers`, `/workers/$id` (run log on detail page) |

## Architecture

New deep module `apps/backend/src/workers/`:

- **Registry** — in-code list of workers `{ id, name, description, execute }`.
- **Runner** — starts a run (guard: at most one `running` per `worker_id`), appends log lines, finishes with `succeeded` / `failed`.
- **Repository** — CRUD for `worker_runs`.
- **tRPC** — thin: `list`, `get`, `listRuns`, `getRun`, `run`.
- **Nightly adapter** — `execute` calls Title watch pipeline **without** 3–4am / once-per-day gates for manual; scheduled path keeps gates and only opens a `WorkerRun` when `ran: true`.

Import DAG: `workers.router` → `workers` core → ports into `title/watch` (wired in `workers/index.ts`). Features do not import each other’s implementations.

Scheduler still starts from `apps/backend/src/index.ts`, but tick outcome with `ran: true` is recorded as `trigger: "scheduled"`.

## Data model

### `worker_runs`

| Column | Type | Notes |
|--------|------|--------|
| `id` | text PK | uuid |
| `worker_id` | text | e.g. `nightly-torrent-check` |
| `trigger` | text | `scheduled` \| `manual` |
| `status` | text | `running` \| `succeeded` \| `failed` |
| `started_at` | timestamptz | |
| `finished_at` | timestamptz nullable | |
| `summary` | text nullable | short outcome |
| `error` | text nullable | top-level failure |
| `log` | jsonb | `WorkerLogLine[]` |

Partial unique index: at most one row with `status = 'running'` per `worker_id`.

Worker idle/running status is derived from whether a running row exists — not a separate table.

### Log line

```ts
type WorkerLogLevel = "info" | "warn" | "error";
type WorkerLogLine = { ts: string; level: WorkerLogLevel; message: string };
```

## API (tRPC `workers.*`)

Auth: `protectedProcedure`.

- `list` → workers with derived status + last run summary  
- `get({ id })` → one worker + last run  
- `listRuns({ workerId, limit? })` → newest first  
- `getRun({ runId })` → full run including `log`  
- `run({ workerId })` → start manual run; error if unknown id or already running  

## Frontend

Feature slice `apps/frontend/src/features/workers/`.

- Thin routes: `/workers`, `/workers/$id`
- SideNav item «Воркеры»
- List: name, status (StatusDot), last run, Run button (disabled when running)
- Detail: run history rows; select a run → leveled log panel
- Poll `list` / `get` / `getRun` every ~2s while any selected worker/run is `running`

Dense List/Table rows; no Card-wrapped run rows (Astryx rules).

## Vocabulary (`CONTEXT.md`)

Add **Worker** (registered background process) and **WorkerRun** (one persisted execution). Avoid “job/cron” for these UI/API concepts; keep **WatchTask** for the per-TitleWatch queue units inside the nightly pipeline.

## Out of scope (v1)

- Cover queue / transfer snapshot as workers  
- Websocket log streaming  
- Cancel / stop mid-run  
- Separate log-lines table  
- Admin role beyond existing auth  
