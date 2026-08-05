import { describe, expect, test } from "bun:test";
import { createMemoryWorkerRunStore } from "./worker-run.memory";
import { createWorkers } from "./workers";
import type {
	WorkerDefinition,
	WorkerLogLine,
	WorkerRunStore,
} from "./workers.types";

const workerId = "nightly-torrent-check";

const baseDef = (
	overrides: Partial<WorkerDefinition> &
		Pick<WorkerDefinition, "execute"> = {
		execute: async () => ({ summary: "ok" }),
	},
): WorkerDefinition => ({
	id: workerId,
	name: "Nightly torrent check",
	description: "Sync watches and check Topics",
	...overrides,
});

function createTestWorkers(
	overrides: {
		definitions?: WorkerDefinition[];
		retainRuns?: number;
		id?: () => string;
		now?: () => Date;
	} = {},
) {
	const store = createMemoryWorkerRunStore();
	let idSeq = 0;
	const workers = createWorkers({
		store,
		now: overrides.now ?? (() => new Date("2026-08-05T12:00:00.000Z")),
		id: overrides.id ?? (() => `run-${++idSeq}`),
		definitions: overrides.definitions ?? [baseDef()],
		retainRuns: overrides.retainRuns ?? 50,
	});
	return { store, workers };
}

describe("workers.run", () => {
	test("starts a manual run, logs, and marks succeeded", async () => {
		const lines: string[] = [];
		const { workers } = createTestWorkers({
			id: () => "run-1",
			definitions: [
				baseDef({
					execute: async ({ log }) => {
						log("info", "start");
						lines.push("executed");
						return { summary: "ok" };
					},
				}),
			],
		});

		const run = await workers.run(workerId);

		expect(lines).toEqual(["executed"]);
		expect(run.status).toBe("succeeded");
		expect(run.trigger).toBe("manual");
		expect(run.summary).toBe("ok");
		expect(run.error).toBeNull();
		expect(run.finishedAt).toEqual(new Date("2026-08-05T12:00:00.000Z"));
		expect(run.log[0]).toEqual({
			ts: "2026-08-05T12:00:00.000Z",
			level: "info",
			message: "start",
		});
	});

	test("awaits fire-and-forget log writes before finish", async () => {
		const base = createMemoryWorkerRunStore();
		const store: WorkerRunStore = {
			...base,
			async appendLog(id, line) {
				await Bun.sleep(20);
				return base.appendLog(id, line);
			},
		};
		const workers = createWorkers({
			store,
			now: () => new Date("2026-08-05T12:00:00.000Z"),
			id: () => "run-1",
			definitions: [
				baseDef({
					execute: async ({ log }) => {
						log("info", "fire-and-forget");
						return { summary: "ok" };
					},
				}),
			],
			retainRuns: 50,
		});

		const run = await workers.run(workerId);

		expect(run.status).toBe("succeeded");
		expect(run.log).toEqual([
			{
				ts: "2026-08-05T12:00:00.000Z",
				level: "info",
				message: "fire-and-forget",
			},
		]);
	});

	test("rejects second run while one is running", async () => {
		let release!: () => void;
		const gate = new Promise<void>((r) => {
			release = r;
		});
		const { workers } = createTestWorkers({
			definitions: [
				baseDef({
					execute: async () => {
						await gate;
						return { summary: "done" };
					},
				}),
			],
		});

		const first = workers.run(workerId);
		await Bun.sleep(10);
		await expect(workers.run(workerId)).rejects.toThrow(/already running/i);
		release();
		await first;
	});

	test("list shows running status from open run", async () => {
		let release!: () => void;
		const gate = new Promise<void>((r) => {
			release = r;
		});
		const { workers } = createTestWorkers({
			definitions: [
				baseDef({
					execute: async () => {
						await gate;
						return { summary: "done" };
					},
				}),
			],
		});

		const pending = workers.run(workerId);
		await Bun.sleep(10);

		const during = await workers.list();
		expect(during).toHaveLength(1);
		expect(during[0]?.status).toBe("running");
		expect(during[0]?.lastRun?.status).toBe("running");

		release();
		await pending;

		const after = await workers.list();
		expect(after[0]?.status).toBe("idle");
		expect(after[0]?.lastRun?.status).toBe("succeeded");
	});

	test("failed execute marks run failed and stores error", async () => {
		const { workers } = createTestWorkers({
			definitions: [
				baseDef({
					execute: async () => {
						throw new Error("pipeline exploded");
					},
				}),
			],
		});

		const run = await workers.run(workerId);

		expect(run.status).toBe("failed");
		expect(run.error).toBe("pipeline exploded");
		expect(run.summary).toBeNull();
		expect(run.finishedAt).not.toBeNull();
	});

	test("recordFinishedRun inserts scheduled completed run", async () => {
		const log: WorkerLogLine[] = [
			{
				ts: "2026-08-05T12:00:00.000Z",
				level: "info",
				message: "Enqueued 1",
			},
		];
		const { workers, store } = createTestWorkers({ id: () => "sched-1" });

		const run = await workers.recordFinishedRun({
			workerId,
			trigger: "scheduled",
			summary: "enqueued 1, processed 1",
			log,
		});

		expect(run).toMatchObject({
			id: "sched-1",
			workerId,
			trigger: "scheduled",
			status: "succeeded",
			summary: "enqueued 1, processed 1",
			error: null,
			log,
		});
		expect(run.finishedAt).not.toBeNull();
		expect(await store.findRunning(workerId)).toBeNull();
		expect(await workers.getRun("sched-1")).toEqual(run);
	});

	test("recordFinishedRun can record a failed run", async () => {
		const log: WorkerLogLine[] = [
			{
				ts: "2026-08-05T12:00:00.000Z",
				level: "error",
				message: "boom",
			},
		];
		const { workers } = createTestWorkers({ id: () => "sched-fail" });

		const run = await workers.recordFinishedRun({
			workerId,
			trigger: "scheduled",
			summary: "failed mid-run",
			log,
			status: "failed",
			error: "pipeline exploded",
		});

		expect(run).toMatchObject({
			id: "sched-fail",
			status: "failed",
			summary: "failed mid-run",
			error: "pipeline exploded",
			log,
		});
		expect(run.finishedAt).not.toBeNull();
	});

	test("recordFinishedRun throws when a run is already running", async () => {
		let release!: () => void;
		const gate = new Promise<void>((r) => {
			release = r;
		});
		const { workers } = createTestWorkers({
			definitions: [
				baseDef({
					execute: async () => {
						await gate;
						return { summary: "done" };
					},
				}),
			],
		});

		const pending = workers.run(workerId);
		await Bun.sleep(10);

		await expect(
			workers.recordFinishedRun({
				workerId,
				trigger: "scheduled",
				summary: "skipped overlap",
				log: [],
			}),
		).rejects.toThrow(/already running/i);

		release();
		await pending;
	});

	test("unknown workerId throws", async () => {
		const { workers } = createTestWorkers();

		await expect(workers.run("missing-worker")).rejects.toThrow(
			/unknown worker/i,
		);
		await expect(
			workers.recordFinishedRun({
				workerId: "missing-worker",
				trigger: "scheduled",
				summary: "x",
				log: [],
			}),
		).rejects.toThrow(/unknown worker/i);
	});

	test("get / listRuns / getRun work", async () => {
		const { workers } = createTestWorkers({
			definitions: [
				baseDef(),
				{
					id: "other",
					name: "Other",
					description: "Other worker",
					execute: async () => ({ summary: "other" }),
				},
			],
		});

		expect(await workers.get("missing")).toBeNull();

		const listed = await workers.list();
		expect(listed.map((w) => w.id)).toEqual([workerId, "other"]);
		expect(listed[0]).toMatchObject({
			id: workerId,
			name: "Nightly torrent check",
			description: "Sync watches and check Topics",
			status: "idle",
			lastRun: null,
		});

		const detail = await workers.get(workerId);
		expect(detail).toMatchObject({
			id: workerId,
			status: "idle",
			lastRun: null,
		});

		const run = await workers.run(workerId);
		expect(await workers.getRun(run.id)).toEqual(run);
		expect(await workers.getRun("missing-run")).toBeNull();

		const runs = await workers.listRuns(workerId);
		expect(runs.map((r) => r.id)).toEqual([run.id]);

		const limited = await workers.listRuns(workerId, 1);
		expect(limited).toHaveLength(1);

		const after = await workers.get(workerId);
		expect(after?.lastRun?.id).toBe(run.id);
		expect(after?.status).toBe("idle");
	});

	test("prunes older runs after run using retainRuns", async () => {
		let hour = 10;
		const { workers, store } = createTestWorkers({
			retainRuns: 2,
			now: () => new Date(`2026-08-05T${hour}:00:00.000Z`),
			id: (() => {
				let n = 0;
				return () => `run-${++n}`;
			})(),
		});

		await workers.run(workerId);
		hour = 11;
		await workers.run(workerId);
		hour = 12;
		await workers.run(workerId);

		const remaining = await store.listByWorker(workerId, 10);
		expect(remaining.map((r) => r.id)).toEqual(["run-3", "run-2"]);
		expect(await store.get("run-1")).toBeNull();
	});
});
