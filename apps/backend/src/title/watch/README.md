# title/watch

Watch pipeline for TV TitleWatches: sync from qB, nightly WatchTasks, and
manual check-now. Composition lives in `index.ts`; core interface is
`createWatch` in `watch.ts`.

## Who calls what

| Caller | Entry | Notes |
|---|---|---|
| App (`src/index.ts`) | `nightlyWorker` (re-exported from `title/`) | Hourly tick → sync → enqueue → drain |
| Title router / `createTitleModule` | `watch.processTask`, store load/save, `enqueueTask` | `setWatch` / `checkNow` stay on Title; they enqueue + drain via Watch |
| Home | `getTitleWatchFeed` (re-exported from `title/`) | Read-model of recent TitleWatchEvents |
| Explicit / future UI | `watch.syncFromQb` | Not called from `Title.get` (read path stays free of qb write sync) |

## Internal flow

```
nightlyWorker.tick
  → watch.syncFromQb          (sync-watches-from-qb)
  → watch.enqueueNightly      (enqueue-nightly-tasks)
  → watch.processTask*        (process-watch-task → check-topic-now)

Title.checkNow
  → watch.enqueueTask(manual)
  → watch.processTask         (same check path as nightly)
```

## Vocabulary

TitleWatch, WatchTask, Transfer — not “follow”.
