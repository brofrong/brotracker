/**
 * Workers composition: registry + Postgres run store + scheduled nightly tick
 * that holds a durable `running` WorkerRun for the whole pipeline (same lock
 * as manual Run).
 *
 * Manual / scheduled both go through `workers.run(...)` → `runNow()`.
 * tRPC surface: `workers.router.ts` (mounted on appRouter as `workers`).
 */

import { nightlyWorker } from "../title/watch";
import { logger } from "../utils/logger";
import {
	runScheduledNightlyOnce,
	startScheduledNightlyWorker,
} from "./scheduled-nightly";
import { createWorkerRunStore } from "./worker-run.repository";
import { createWorkers } from "./workers";

export const NIGHTLY_TORRENT_CHECK_ID = "nightly-torrent-check";

const DEFAULT_CHECK_INTERVAL_MS = 60 * 60 * 1000;
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
	],
	now: () => new Date(),
	id: () => crypto.randomUUID(),
	retainRuns: RETAIN_RUNS,
});

export function startWorkers(
	intervalMs: number = DEFAULT_CHECK_INTERVAL_MS,
): () => void {
	let stopInterval: (() => void) | undefined;

	void (async () => {
		try {
			await workers.failInterruptedRuns(INTERRUPTED_ERROR);
		} catch (err) {
			logger.warn(
				{ err },
				"Failed to clear interrupted WorkerRuns on startup",
			);
		}
		stopInterval = startScheduledNightlyWorker({
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
	})();

	return () => stopInterval?.();
}

export { runScheduledNightlyOnce, startScheduledNightlyWorker } from "./scheduled-nightly";
export { createWorkers } from "./workers";
export { createWorkerRunStore } from "./worker-run.repository";
export type { WorkersDeps } from "./workers";
export type {
	WorkerDefinition,
	WorkerDetail,
	WorkerListItem,
	WorkerRunRecord,
} from "./workers.types";
