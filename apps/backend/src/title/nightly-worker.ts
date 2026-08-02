/**
 * Nightly worker: once per night, sync watches from qB, enqueue pending
 * WatchTasks for every tracked title, then drain the pending queue through
 * the same processWatchTask path that manual checkNow uses.
 *
 * The tick is a plain async function of an injected clock so tests can
 * drive it without waiting for a real night to happen; start() wraps it in
 * a simple hourly setInterval (see qbittorent.poller.ts for the same
 * pattern).
 */

const NIGHT_WINDOW_START_HOUR = 3;
const NIGHT_WINDOW_END_HOUR = 4; // inclusive; tick runs once somewhere in [3:00, 5:00)
const DEFAULT_CHECK_INTERVAL_MS = 60 * 60 * 1000;

export function isWithinNightlyWindow(date: Date): boolean {
	const hour = date.getHours();
	return hour >= NIGHT_WINDOW_START_HOUR && hour <= NIGHT_WINDOW_END_HOUR;
}

export type NightlyWorkerDeps = {
	sync: () => Promise<unknown>;
	enqueue: () => Promise<{ enqueued: number }>;
	listPendingTaskIds: () => Promise<string[]>;
	processTask: (taskId: string) => Promise<unknown>;
	now: () => Date;
};

export type NightlyTickResult =
	| { ran: false }
	| { ran: true; enqueued: number; processed: number };

export function createNightlyWorker(deps: NightlyWorkerDeps) {
	let lastRunDateKey: string | null = null;

	function dateKey(date: Date): string {
		return date.toISOString().slice(0, 10);
	}

	async function drainPendingTasks(): Promise<number> {
		const ids = await deps.listPendingTaskIds();
		let processed = 0;
		for (const id of ids) {
			try {
				await deps.processTask(id);
			} catch {
				// A single bad task must never take down the rest of the queue;
				// processWatchTask already persists the failure on the task row.
			}
			processed += 1;
		}
		return processed;
	}

	async function tick(): Promise<NightlyTickResult> {
		const now = deps.now();
		if (!isWithinNightlyWindow(now)) {
			return { ran: false };
		}

		const key = dateKey(now);
		if (lastRunDateKey === key) {
			return { ran: false };
		}
		lastRunDateKey = key;

		await deps.sync();
		const { enqueued } = await deps.enqueue();
		const processed = await drainPendingTasks();

		return { ran: true, enqueued, processed };
	}

	function start(intervalMs: number = DEFAULT_CHECK_INTERVAL_MS): () => void {
		void tick();
		const interval = setInterval(() => {
			void tick();
		}, intervalMs);
		return () => clearInterval(interval);
	}

	return { tick, start, drainPendingTasks };
}

export type NightlyWorker = ReturnType<typeof createNightlyWorker>;
