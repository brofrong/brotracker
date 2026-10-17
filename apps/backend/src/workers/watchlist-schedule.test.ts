import { describe, expect, test } from "bun:test";
import {
	isWatchlistSearchDue,
	type RunWatchlistTickDeps,
	runWatchlistTickOnce,
	startWatchlistScheduler,
} from "./watchlist-schedule";

describe("isWatchlistSearchDue", () => {
	test("no last run -> due", () => {
		const due = isWatchlistSearchDue({
			lastStartedAt: null,
			intervalHours: 24,
			now: new Date("2026-10-17T12:00:00.000Z"),
		});
		expect(due).toBe(true);
	});

	test("last run 23h ago with a 24h interval -> not due", () => {
		const due = isWatchlistSearchDue({
			lastStartedAt: "2026-10-17T13:00:00.000Z",
			intervalHours: 24,
			now: new Date("2026-10-18T12:00:00.000Z"),
		});
		expect(due).toBe(false);
	});

	test("last run 24h ago with a 24h interval -> due", () => {
		const due = isWatchlistSearchDue({
			lastStartedAt: "2026-10-17T12:00:00.000Z",
			intervalHours: 24,
			now: new Date("2026-10-18T12:00:00.000Z"),
		});
		expect(due).toBe(true);
	});

	test("interval 2h, last run 2h1min ago -> due", () => {
		const due = isWatchlistSearchDue({
			lastStartedAt: "2026-10-17T09:58:00.000Z",
			intervalHours: 2,
			now: new Date("2026-10-17T11:59:00.000Z"),
		});
		expect(due).toBe(true);
	});
});

describe("startWatchlistScheduler", () => {
	test("invokes tick on start", async () => {
		let ticks = 0;
		let resolveTick!: () => void;
		const tickDone = new Promise<void>((r) => {
			resolveTick = r;
		});

		const stop = startWatchlistScheduler({
			tickMs: 60_000,
			tick: async () => {
				ticks += 1;
				queueMicrotask(resolveTick);
			},
		});

		await tickDone;
		await Bun.sleep(10);
		stop();

		expect(ticks).toBe(1);
	});

	test("swallows tick errors so the process stays up", async () => {
		let resolveTick!: () => void;
		const tickDone = new Promise<void>((r) => {
			resolveTick = r;
		});

		const stop = startWatchlistScheduler({
			tickMs: 60_000,
			tick: async () => {
				queueMicrotask(resolveTick);
				throw new Error("boom");
			},
		});

		await tickDone;
		await Bun.sleep(10);
		stop();

		// No uncaught rejection/throw observed; reaching here is the assertion.
		expect(true).toBe(true);
	});

	test("stop prevents further ticks", async () => {
		let ticks = 0;
		let resolveTick!: () => void;
		const tickDone = new Promise<void>((r) => {
			resolveTick = r;
		});

		const stop = startWatchlistScheduler({
			tickMs: 5,
			tick: async () => {
				ticks += 1;
				if (ticks === 1) queueMicrotask(resolveTick);
			},
		});

		await tickDone;
		stop();
		const countAtStop = ticks;
		await Bun.sleep(30);

		expect(ticks).toBe(countAtStop);
	});
});

describe("runWatchlistTickOnce", () => {
	const NOW = new Date("2026-10-17T12:00:00.000Z");

	function makeDeps(overrides: Partial<RunWatchlistTickDeps> = {}) {
		const calls = { runs: 0, syncErrors: [] as unknown[] };
		const deps: RunWatchlistTickDeps = {
			syncDownloads: async () => {},
			onSyncError: (err) => {
				calls.syncErrors.push(err);
			},
			loadLastRun: async () => ({ running: false, lastStartedAt: null }),
			loadIntervalHours: async () => 24,
			runScheduled: async () => {
				calls.runs += 1;
			},
			now: () => NOW,
			...overrides,
		};
		return { deps, calls };
	}

	test("syncs downloads, then runs the due search", async () => {
		const order: string[] = [];
		const { deps } = makeDeps({
			syncDownloads: async () => {
				order.push("sync");
			},
			runScheduled: async () => {
				order.push("run");
			},
		});

		expect(await runWatchlistTickOnce(deps)).toBe("ran");
		expect(order).toEqual(["sync", "run"]);
	});

	test("qB being unreachable during sync still runs the due search", async () => {
		const error = new Error("qBittorrent unreachable");
		const { deps, calls } = makeDeps({
			syncDownloads: async () => {
				throw error;
			},
		});

		expect(await runWatchlistTickOnce(deps)).toBe("ran");
		expect(calls.runs).toBe(1);
		expect(calls.syncErrors).toEqual([error]);
	});

	test("a running search is not started again", async () => {
		const { deps, calls } = makeDeps({
			loadLastRun: async () => ({
				running: true,
				lastStartedAt: "2026-10-16T00:00:00.000Z",
			}),
		});

		expect(await runWatchlistTickOnce(deps)).toBe("skipped-running");
		expect(calls.runs).toBe(0);
	});

	test("a search that ran recently is not due", async () => {
		const { deps, calls } = makeDeps({
			loadLastRun: async () => ({
				running: false,
				lastStartedAt: "2026-10-17T11:00:00.000Z",
			}),
		});

		expect(await runWatchlistTickOnce(deps)).toBe("not-due");
		expect(calls.runs).toBe(0);
	});
});
