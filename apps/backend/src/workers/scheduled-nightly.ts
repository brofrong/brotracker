import { logger } from "../utils/logger";

const DEFAULT_CHECK_INTERVAL_MS = 60 * 60 * 1000;

export type RunScheduledNightlyOnceDeps = {
	isRunning: () => Promise<boolean>;
	shouldRun: () => boolean;
	noteScheduledStart: () => void;
	runScheduled: () => Promise<unknown>;
};

export type ScheduledNightlyOutcome =
	| "skipped-running"
	| "skipped-gates"
	| "ran";

/**
 * Two-phase scheduled nightly: peek gates without a WorkerRun row, then
 * mark the date key and run under the same durable lock as manual Run.
 */
export async function runScheduledNightlyOnce(
	deps: RunScheduledNightlyOnceDeps,
): Promise<ScheduledNightlyOutcome> {
	if (await deps.isRunning()) {
		return "skipped-running";
	}
	if (!deps.shouldRun()) {
		return "skipped-gates";
	}
	deps.noteScheduledStart();
	await deps.runScheduled();
	return "ran";
}

export type StartScheduledNightlyWorkerOptions = {
	tick: () => Promise<void>;
	intervalMs?: number;
};

/**
 * Interval that calls the scheduled nightly tick. Tick errors are logged
 * so a failed/locked run never takes down the process.
 */
export function startScheduledNightlyWorker(
	options: StartScheduledNightlyWorkerOptions,
): () => void {
	const intervalMs = options.intervalMs ?? DEFAULT_CHECK_INTERVAL_MS;

	async function scheduledTick() {
		try {
			await options.tick();
		} catch (err) {
			logger.warn({ err }, "Scheduled nightly tick failed");
		}
	}

	void scheduledTick();
	const interval = setInterval(() => {
		void scheduledTick();
	}, intervalMs);
	return () => clearInterval(interval);
}
