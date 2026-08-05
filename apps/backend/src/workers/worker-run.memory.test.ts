import { describe, expect, test } from "bun:test";
import { createMemoryWorkerRunStore } from "./worker-run.memory";
import type { WorkerLogLine } from "./workers.types";

const workerId = "nightly-torrent-check";

function logLine(
	partial: Partial<WorkerLogLine> & Pick<WorkerLogLine, "message">,
): WorkerLogLine {
	return {
		ts: "2026-08-05T12:00:00.000Z",
		level: "info",
		...partial,
	};
}

describe("createMemoryWorkerRunStore", () => {
	test("insertRunning + get + findRunning", async () => {
		const store = createMemoryWorkerRunStore();
		const startedAt = new Date("2026-08-05T12:00:00.000Z");

		const run = await store.insertRunning({
			id: "run-1",
			workerId,
			trigger: "manual",
			startedAt,
		});

		expect(run).toMatchObject({
			id: "run-1",
			workerId,
			trigger: "manual",
			status: "running",
			startedAt,
			finishedAt: null,
			summary: null,
			error: null,
			log: [],
		});
		expect(await store.get("run-1")).toEqual(run);
		expect(await store.findRunning(workerId)).toEqual(run);
		expect(await store.findRunning("other-worker")).toBeNull();
		expect(await store.get("missing")).toBeNull();
	});

	test("rejects second concurrent running for same worker", async () => {
		const store = createMemoryWorkerRunStore();

		await store.insertRunning({
			id: "run-1",
			workerId,
			trigger: "manual",
			startedAt: new Date("2026-08-05T12:00:00.000Z"),
		});

		await expect(
			store.insertRunning({
				id: "run-2",
				workerId,
				trigger: "scheduled",
				startedAt: new Date("2026-08-05T12:01:00.000Z"),
			}),
		).rejects.toThrow(/already running/i);

		await store.insertRunning({
			id: "run-3",
			workerId: "other-worker",
			trigger: "manual",
			startedAt: new Date("2026-08-05T12:02:00.000Z"),
		});
	});

	test("appendLog + finish", async () => {
		const store = createMemoryWorkerRunStore();
		await store.insertRunning({
			id: "run-1",
			workerId,
			trigger: "manual",
			startedAt: new Date("2026-08-05T12:00:00.000Z"),
		});

		const line = logLine({ message: "start" });
		await store.appendLog("run-1", line);

		const finishedAt = new Date("2026-08-05T12:05:00.000Z");
		const finished = await store.finish("run-1", {
			status: "succeeded",
			finishedAt,
			summary: "ok",
			error: null,
		});

		expect(finished).toMatchObject({
			id: "run-1",
			status: "succeeded",
			finishedAt,
			summary: "ok",
			error: null,
			log: [line],
		});
		expect(await store.findRunning(workerId)).toBeNull();
		expect(await store.get("run-1")).toEqual(finished);
	});

	test("listByWorker newest first", async () => {
		const store = createMemoryWorkerRunStore();

		await store.insertRunning({
			id: "run-old",
			workerId,
			trigger: "manual",
			startedAt: new Date("2026-08-05T10:00:00.000Z"),
		});
		await store.finish("run-old", {
			status: "succeeded",
			finishedAt: new Date("2026-08-05T10:01:00.000Z"),
			summary: null,
			error: null,
		});

		await store.insertRunning({
			id: "run-mid",
			workerId,
			trigger: "manual",
			startedAt: new Date("2026-08-05T11:00:00.000Z"),
		});
		await store.finish("run-mid", {
			status: "failed",
			finishedAt: new Date("2026-08-05T11:01:00.000Z"),
			summary: null,
			error: "boom",
		});

		await store.insertRunning({
			id: "run-new",
			workerId,
			trigger: "scheduled",
			startedAt: new Date("2026-08-05T12:00:00.000Z"),
		});
		await store.finish("run-new", {
			status: "succeeded",
			finishedAt: new Date("2026-08-05T12:01:00.000Z"),
			summary: "ok",
			error: null,
		});

		await store.insertRunning({
			id: "other-run",
			workerId: "other-worker",
			trigger: "manual",
			startedAt: new Date("2026-08-05T13:00:00.000Z"),
		});

		const listed = await store.listByWorker(workerId, 10);
		expect(listed.map((r) => r.id)).toEqual(["run-new", "run-mid", "run-old"]);

		const limited = await store.listByWorker(workerId, 2);
		expect(limited.map((r) => r.id)).toEqual(["run-new", "run-mid"]);
	});

	test("pruneOlderThan keeps N newest", async () => {
		const store = createMemoryWorkerRunStore();

		for (const [id, hour] of [
			["run-1", "10"],
			["run-2", "11"],
			["run-3", "12"],
			["run-4", "13"],
		] as const) {
			await store.insertRunning({
				id,
				workerId,
				trigger: "manual",
				startedAt: new Date(`2026-08-05T${hour}:00:00.000Z`),
			});
			await store.finish(id, {
				status: "succeeded",
				finishedAt: new Date(`2026-08-05T${hour}:01:00.000Z`),
				summary: null,
				error: null,
			});
		}

		await store.insertRunning({
			id: "other-keep",
			workerId: "other-worker",
			trigger: "manual",
			startedAt: new Date("2026-08-05T09:00:00.000Z"),
		});
		await store.finish("other-keep", {
			status: "succeeded",
			finishedAt: new Date("2026-08-05T09:01:00.000Z"),
			summary: null,
			error: null,
		});

		await store.pruneOlderThan(workerId, 2);

		expect((await store.listByWorker(workerId, 10)).map((r) => r.id)).toEqual([
			"run-4",
			"run-3",
		]);
		expect(await store.get("run-1")).toBeNull();
		expect(await store.get("run-2")).toBeNull();
		expect(await store.get("other-keep")).not.toBeNull();
	});
});
