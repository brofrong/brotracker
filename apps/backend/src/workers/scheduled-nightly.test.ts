import { describe, expect, test } from "bun:test";
import { startScheduledNightlyWorker } from "./scheduled-nightly";
import type { NightlyTickResult } from "../title/watch/nightly-worker";

describe("startScheduledNightlyWorker", () => {
	test("records a finished run when tick ran", async () => {
		const recorded: NightlyTickResult[] = [];
		let resolveTick!: () => void;
		const tickDone = new Promise<void>((r) => {
			resolveTick = r;
		});

		const stop = startScheduledNightlyWorker({
			intervalMs: 60_000,
			tick: async () => {
				const result = {
					ran: true as const,
					enqueued: 2,
					processed: 3,
				};
				queueMicrotask(resolveTick);
				return result;
			},
			onRan: async (result) => {
				recorded.push(result);
			},
		});

		await tickDone;
		await Bun.sleep(10);
		stop();

		expect(recorded).toEqual([
			{ ran: true, enqueued: 2, processed: 3 },
		]);
	});

	test("does not record when tick did not run", async () => {
		const recorded: unknown[] = [];
		let resolveTick!: () => void;
		const tickDone = new Promise<void>((r) => {
			resolveTick = r;
		});

		const stop = startScheduledNightlyWorker({
			intervalMs: 60_000,
			tick: async () => {
				queueMicrotask(resolveTick);
				return { ran: false };
			},
			onRan: async (result) => {
				recorded.push(result);
			},
		});

		await tickDone;
		await Bun.sleep(10);
		stop();

		expect(recorded).toEqual([]);
	});

	test("swallows onRan errors so the process stays up", async () => {
		let resolveTick!: () => void;
		const tickDone = new Promise<void>((r) => {
			resolveTick = r;
		});

		const stop = startScheduledNightlyWorker({
			intervalMs: 60_000,
			tick: async () => {
				queueMicrotask(resolveTick);
				return { ran: true, enqueued: 0, processed: 0 };
			},
			onRan: async () => {
				throw new Error("Worker nightly-torrent-check already running");
			},
		});

		await tickDone;
		await Bun.sleep(10);
		stop();
		// If we got here without an unhandled rejection, the guard worked.
		expect(true).toBe(true);
	});
});
