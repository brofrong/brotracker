import { logger } from "../utils/logger";

export const WATCHLIST_SEARCH_ID = "watchlist-search";

/**
 * Whether the scheduled watchlist search is due: no prior run is always
 * due; otherwise due once at least `intervalHours` have elapsed since the
 * last run started.
 */
export function isWatchlistSearchDue(input: {
	lastStartedAt: string | null;
	intervalHours: number;
	now: Date;
}): boolean {
	if (input.lastStartedAt === null) {
		return true;
	}
	const elapsedMs =
		input.now.getTime() - new Date(input.lastStartedAt).getTime();
	return elapsedMs >= input.intervalHours * 60 * 60 * 1000;
}

export type StartWatchlistSchedulerDeps = {
	tickMs: number;
	tick: () => Promise<void>;
};

/**
 * Interval that calls the watchlist search tick. Tick errors are logged so
 * a failed/locked run never takes down the process.
 */
export function startWatchlistScheduler(
	deps: StartWatchlistSchedulerDeps,
): () => void {
	async function scheduledTick() {
		try {
			await deps.tick();
		} catch (err) {
			logger.warn({ err }, "Scheduled watchlist search tick failed");
		}
	}

	void scheduledTick();
	const interval = setInterval(() => {
		void scheduledTick();
	}, deps.tickMs);
	return () => clearInterval(interval);
}
