/**
 * Workers composition: registry + Postgres run store + scheduled nightly tick
 * that records durable WorkerRuns when the night window pipeline actually runs.
 *
 * Manual runs go through `workers.run("nightly-torrent-check")` → `runNow()`.
 * Task 5 mounts the tRPC router on this module.
 */

import { nightlyWorker } from "../title/watch";
import { startScheduledNightlyWorker } from "./scheduled-nightly";
import { createWorkerRunStore } from "./worker-run.repository";
import { createWorkers } from "./workers";

export const NIGHTLY_TORRENT_CHECK_ID = "nightly-torrent-check";

const DEFAULT_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const RETAIN_RUNS = 50;

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
	return startScheduledNightlyWorker({
		intervalMs,
		tick: () => nightlyWorker.tick(),
		onRan: async (result) => {
			await workers.recordFinishedRun({
				workerId: NIGHTLY_TORRENT_CHECK_ID,
				trigger: "scheduled",
				summary: `enqueued ${result.enqueued}, processed ${result.processed}`,
				log: [
					{
						ts: new Date().toISOString(),
						level: "info",
						message: `Enqueued ${result.enqueued}`,
					},
					{
						ts: new Date().toISOString(),
						level: "info",
						message: `Processed ${result.processed}`,
					},
				],
			});
		},
	});
}

export { startScheduledNightlyWorker } from "./scheduled-nightly";
export { createWorkers } from "./workers";
export { createWorkerRunStore } from "./worker-run.repository";
export type { WorkersDeps } from "./workers";
export type {
	WorkerDefinition,
	WorkerDetail,
	WorkerListItem,
	WorkerRunRecord,
} from "./workers.types";
