/**
 * Workers composition: registry + Postgres run store + scheduled nightly tick
 * that holds a durable `running` WorkerRun for the whole pipeline (same lock
 * as manual Run).
 *
 * Manual / scheduled both go through `workers.run(...)` → `runNow()`.
 * tRPC surface: `workers.router.ts` (mounted on appRouter as `workers`).
 */

import { loadWatchlistSettings } from "../settings/watchlist-settings";
import { nightlyWorker, waitingSearch } from "../title";
import { logger } from "../utils/logger";
import {
	runScheduledNightlyOnce,
	startScheduledNightlyWorker,
} from "./scheduled-nightly";
import {
	runWatchlistTickOnce,
	startWatchlistScheduler,
	WATCHLIST_SEARCH_ID,
} from "./watchlist-schedule";
import { createWorkerRunStore } from "./worker-run.repository";
import { createWorkers } from "./workers";

export const NIGHTLY_TORRENT_CHECK_ID = "nightly-torrent-check";

const DEFAULT_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const WATCHLIST_SEARCH_TICK_MS = 5 * 60 * 1000;
const RETAIN_RUNS = 50;
const INTERRUPTED_ERROR = "Interrupted by process restart";

export const workers = createWorkers({
	store: createWorkerRunStore(),
	definitions: [
		{
			id: NIGHTLY_TORRENT_CHECK_ID,
			name: "Ночная проверка торрентов",
			description: "Ночная проверка обновлений Topic для TitleWatch",
			execute: async ({ log }) => {
				await log("info", "Starting nightly torrent check");
				const result = await nightlyWorker.runNow();
				await log("info", `Enqueued ${result.enqueued}`);
				await log("info", `Processed ${result.processed}`);
				return {
					summary: `enqueued ${result.enqueued}, processed ${result.processed}`,
				};
			},
		},
		{
			id: WATCHLIST_SEARCH_ID,
			name: "Поиск ожидаемых",
			description: "Ищет раздачи для фильмов и сериалов из «Жду»",
			execute: async ({ log }) => {
				const result = await waitingSearch.runAll((line) => {
					void log("info", line);
				});
				return {
					summary: `проверено ${result.checked} · начато ${result.started} · ошибок ${result.failed}`,
				};
			},
		},
	],
	now: () => new Date(),
	id: () => crypto.randomUUID(),
	retainRuns: RETAIN_RUNS,
});

export function startWorkers(
	intervalMs: number = DEFAULT_CHECK_INTERVAL_MS,
): () => void {
	let stopNightly: (() => void) | undefined;
	let stopWatchlist: (() => void) | undefined;

	void (async () => {
		try {
			await workers.failInterruptedRuns(INTERRUPTED_ERROR);
		} catch (err) {
			logger.warn({ err }, "Failed to clear interrupted WorkerRuns on startup");
		}
		stopNightly = startScheduledNightlyWorker({
			intervalMs,
			tick: async () => {
				const outcome = await runScheduledNightlyOnce({
					isRunning: async () => {
						const detail = await workers.get(NIGHTLY_TORRENT_CHECK_ID);
						return detail?.status === "running";
					},
					shouldRun: () => nightlyWorker.shouldRun(),
					noteScheduledStart: () => nightlyWorker.noteScheduledStart(),
					runScheduled: () =>
						workers.run(NIGHTLY_TORRENT_CHECK_ID, {
							trigger: "scheduled",
						}),
				});
				if (outcome === "skipped-running") {
					logger.info(
						"Skipping scheduled nightly tick; worker already running",
					);
				}
			},
		});
		stopWatchlist = startWatchlistScheduler({
			tickMs: WATCHLIST_SEARCH_TICK_MS,
			tick: async () => {
				await runWatchlistTickOnce({
					syncDownloads: () => waitingSearch.syncDownloads(),
					onSyncError: (err) => {
						logger.warn({ err }, "Watchlist download sync failed");
					},
					loadLastRun: async () => {
						const detail = await workers.get(WATCHLIST_SEARCH_ID);
						return {
							running: detail?.status === "running",
							lastStartedAt: detail?.lastRun?.startedAt.toISOString() ?? null,
						};
					},
					loadIntervalHours: async () =>
						(await loadWatchlistSettings()).checkIntervalHours,
					runScheduled: () =>
						workers.run(WATCHLIST_SEARCH_ID, { trigger: "scheduled" }),
					now: () => new Date(),
				});
			},
		});
	})();

	return () => {
		stopNightly?.();
		stopWatchlist?.();
	};
}

export {
	runScheduledNightlyOnce,
	startScheduledNightlyWorker,
} from "./scheduled-nightly";
export {
	isWatchlistSearchDue,
	runWatchlistTickOnce,
	startWatchlistScheduler,
	WATCHLIST_SEARCH_ID,
} from "./watchlist-schedule";
export { createWorkerRunStore } from "./worker-run.repository";
export type { WorkersDeps } from "./workers";
export { createWorkers } from "./workers";
export type {
	WorkerDefinition,
	WorkerDetail,
	WorkerListItem,
	WorkerRunRecord,
} from "./workers.types";
