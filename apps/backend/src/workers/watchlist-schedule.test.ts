import { describe, expect, test } from "bun:test";
import {
	isWatchlistSearchDue,
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
