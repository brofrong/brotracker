# Transfer speed stats page

Date: 2026-08-05  
Status: approved

## Goal

Dedicated Stats page with a year-scale chart of daily active Transfer speeds (upload + download): average lines with min–max bands, plus period presets and a custom from–to range.

## Decisions

| Topic | Choice |
|--------|--------|
| Scope (v1) | Speed chart only (+ period controls); no traffic / summary cards |
| Aggregation | Per UTC day; min / avg / max from samples with speed > 0 only |
| Chart | Avg upload + avg download lines; min–max as translucent bands |
| Period | Default 1 year; presets 30d / 90d / 1y; custom from–to (max span 3 years) |
| Storage | New `transfer_daily_speed_stats` rollup table (approach A) |
| Raw samples | Keep ~30d prune for Home live chart |
| Rollup retention | No prune in v1 |
| Home widget | Unchanged |
| Route | `/stats`; nav label Stats / Статистика |
| Backfill | One-shot from existing raw samples (≤30d) on deploy |

## Architecture

- **DB** — `apps/backend/src/db/transfer/transfer-daily-speed-stats.schema.ts`
- **Core** — pure rollup helpers + history range builder in `home/` next to `transfer-history.ts`
- **Persistence** — upsert on each speed sample in the existing Transfer snapshot scheduler; optional backfill from raw samples
- **API** — `home.speedHistory({ from, to })` → days with nullable download/upload `{ min, avg, max }`
- **FE** — `features/stats/` + thin `routes/stats.tsx`; Recharts; Astryx `SegmentedControl` + `DateRangeInput`

Import DAG unchanged: router → home core / transfer-history → db.

## Data model

### `transfer_daily_speed_stats`

| Column | Type | Notes |
|--------|------|--------|
| `day` | date PK | UTC YYYY-MM-DD |
| `min_download_speed` | bigint nullable | B/s; null if no active down samples |
| `max_download_speed` | bigint nullable | |
| `sum_download_speed` | bigint | running sum for avg |
| `active_download_samples` | integer | count of samples with downloadSpeed > 0 |
| `min_upload_speed` | bigint nullable | |
| `max_upload_speed` | bigint nullable | |
| `sum_upload_speed` | bigint | |
| `active_upload_samples` | integer | |
| `updated_at` | timestamptz | |

API avg = `round(sum / count)` when count > 0; else direction is `null`.

## API

```ts
speedHistory({ from: "YYYY-MM-DD", to: "YYYY-MM-DD" })
→ { days: Array<{
  date: string;
  download: { min: number; avg: number; max: number } | null;
  upload: { min: number; avg: number; max: number } | null;
}> }
```

Validation: `from ≤ to`; span ≤ 1096 days (~3 years). Response fills every calendar day in range; missing rollup → both directions null.

## UI

- SideNav item after Torrents
- Hero Card chart: orange download / blue upload (match Home)
- Gaps when null (`connectNulls={false}`)
- Tooltip: per direction min · avg · max
- Empty state when no active days in range

## Out of scope (v1)

- Traffic charts / ratio cards
- Changing Home transfer widget
- Multi-year prune policy
- Live websocket on Stats page
