import { describe, expect, test } from "bun:test";
import {
	runScheduledNightlyOnce,
	startScheduledNightlyWorker,
} from "./scheduled-nightly";

describe("runScheduledNightlyOnce", () => {
	test("skips when a run is already in progress", async () => {
		const calls: string[] = [];
		const outcome = await runScheduledNightlyOnce({
			isRunning: async () => {
				calls.push("isRunning");
				return true;
			},
			shouldRun: () => {
				calls.push("shouldRun");
				return true;
			},
			noteScheduledStart: () => {
				calls.push("note");
			},
			runScheduled: async () => {
				calls.push("run");
			},
		});

		expect(outcome).toBe("skipped-running");
		expect(calls).toEqual(["isRunning"]);
	});

	test("skips when night gates say no", async () => {
		const calls: string[] = [];
		const outcome = await runScheduledNightlyOnce({
			isRunning: async () => false,
			shouldRun: () => {
				calls.push("shouldRun");
				return false;
			},
			noteScheduledStart: () => {
				calls.push("note");
			},
			runScheduled: async () => {
				calls.push("run");
			},
		});

		expect(outcome).toBe("skipped-gates");
		expect(calls).toEqual(["shouldRun"]);
	});

	test("notes start then runs under lock when gates pass", async () => {
		const calls: string[] = [];
		const outcome = await runScheduledNightlyOnce({
			isRunning: async () => false,
			shouldRun: () => true,
			noteScheduledStart: () => {
				calls.push("note");
			},
			runScheduled: async () => {
				calls.push("run");
			},
		});

		expect(outcome).toBe("ran");
		expect(calls).toEqual(["note", "run"]);
	});
});

describe("startScheduledNightlyWorker", () => {
	test("invokes tick on start", async () => {
		let ticks = 0;
		let resolveTick!: () => void;
		const tickDone = new Promise<void>((r) => {
			resolveTick = r;
		});

		const stop = startScheduledNightlyWorker({
			intervalMs: 60_000,
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

		const stop = startScheduledNightlyWorker({
			intervalMs: 60_000,
			tick: async () => {
				queueMicrotask(resolveTick);
				throw new Error("Worker nightly-torrent-check already running");
			},
		});

		await tickDone;
		await Bun.sleep(10);
		stop();
		expect(true).toBe(true);
	});
});
