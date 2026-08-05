import type { NightlyTickResult } from "../title/watch/nightly-worker";
import { logger } from "../utils/logger";

const DEFAULT_CHECK_INTERVAL_MS = 60 * 60 * 1000;

export type StartScheduledNightlyWorkerOptions = {
	tick: () => Promise<NightlyTickResult>;
	onRan: (
		result: Extract<NightlyTickResult, { ran: true }>,
	) => Promise<void>;
	intervalMs?: number;
};

/**
 * Interval that calls nightly tick and, when it ran, invokes onRan
 * (typically workers.recordFinishedRun). If onRan throws — e.g. a manual
 * run is already in progress — we log and continue so the process stays up.
 */
export function startScheduledNightlyWorker(
	options: StartScheduledNightlyWorkerOptions,
): () => void {
	const intervalMs = options.intervalMs ?? DEFAULT_CHECK_INTERVAL_MS;

	async function scheduledTick() {
		const result = await options.tick();
		if (!result.ran) {
			return;
		}
		try {
			await options.onRan(result);
		} catch (err) {
			logger.warn(
				{ err },
				"Failed to record scheduled nightly WorkerRun (manual run may be in progress)",
			);
		}
	}

	void scheduledTick();
	const interval = setInterval(() => {
		void scheduledTick();
	}, intervalMs);
	return () => clearInterval(interval);
}
