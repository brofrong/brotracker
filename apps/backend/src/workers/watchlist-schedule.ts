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

export type RunWatchlistTickDeps = {
	/** Marks finished film downloads completed; throws when qB is unreachable. */
	syncDownloads: () => Promise<unknown>;
	onSyncError: (err: unknown) => void;
	loadLastRun: () => Promise<{
		running: boolean;
		lastStartedAt: string | null;
	}>;
	loadIntervalHours: () => Promise<number>;
	runScheduled: () => Promise<unknown>;
	now: () => Date;
};

export type WatchlistTickOutcome = "skipped-running" | "not-due" | "ran";

/**
 * One scheduler tick: sync finished downloads, then start the search when it
 * is due. A failed sync (qB down) is reported and never blocks the search, so
 * the scheduled run — and its WorkerRun trace — still happens.
 */
export async function runWatchlistTickOnce(
	deps: RunWatchlistTickDeps,
): Promise<WatchlistTickOutcome> {
	try {
		await deps.syncDownloads();
	} catch (err) {
		deps.onSyncError(err);
	}
	const lastRun = await deps.loadLastRun();
	if (lastRun.running) {
		return "skipped-running";
	}
	const due = isWatchlistSearchDue({
		lastStartedAt: lastRun.lastStartedAt,
		intervalHours: await deps.loadIntervalHours(),
		now: deps.now(),
	});
	if (!due) {
		return "not-due";
	}
	await deps.runScheduled();
	return "ran";
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
