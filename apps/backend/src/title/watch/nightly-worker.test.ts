import { describe, expect, test } from "bun:test";
import { createNightlyWorker } from "./nightly-worker";

function nightlyDeps(
	overrides: Partial<Parameters<typeof createNightlyWorker>[0]> = {},
) {
	const calls: string[] = [];
	return {
		calls,
		sync: async () => {
			calls.push("sync");
			return { upserted: 0 };
		},
		enqueue: async () => {
			calls.push("enqueue");
			return { enqueued: 1 };
		},
		listPendingTaskIds: async () => {
			calls.push("list");
			return ["task-1"];
		},
		processTask: async (id: string) => {
			calls.push(`process:${id}`);
		},
		now: () => new Date("2026-08-02T03:30:00.000Z"),
		...overrides,
	};
}

describe("nightly worker tick", () => {
	test("outside the nightly window it does nothing", async () => {
		const deps = nightlyDeps({
			now: () => new Date("2026-08-02T12:00:00.000Z"),
		});
		const worker = createNightlyWorker(deps);

		const result = await worker.tick();

		expect(result).toEqual({ ran: false });
		expect(deps.calls).toEqual([]);
	});

	test("inside the nightly window it syncs, enqueues, then drains pending tasks", async () => {
		const deps = nightlyDeps();
		const worker = createNightlyWorker(deps);

		const result = await worker.tick();

		expect(result).toEqual({ ran: true, enqueued: 1, processed: 1 });
		expect(deps.calls).toEqual(["sync", "enqueue", "list", "process:task-1"]);
	});

	test("last-run guard: a second tick the same night is a no-op", async () => {
		const deps = nightlyDeps();
		const worker = createNightlyWorker(deps);

		await worker.tick();
		deps.calls.length = 0;
		const second = await worker.tick();

		expect(second).toEqual({ ran: false });
		expect(deps.calls).toEqual([]);
	});

	test("a new night (new date key) runs again", async () => {
		let current = new Date("2026-08-02T03:30:00.000Z");
		const deps = nightlyDeps({ now: () => current });
		const worker = createNightlyWorker(deps);

		await worker.tick();
		deps.calls.length = 0;
		current = new Date("2026-08-03T03:30:00.000Z");
		const second = await worker.tick();

		expect(second).toEqual({ ran: true, enqueued: 1, processed: 1 });
		expect(deps.calls).toEqual(["sync", "enqueue", "list", "process:task-1"]);
	});

	test("a failing task does not stop the rest of the queue from draining", async () => {
		const processed: string[] = [];
		const deps = nightlyDeps({
			listPendingTaskIds: async () => ["task-1", "task-2"],
			processTask: async (id: string) => {
				if (id === "task-1") {
					throw new Error("boom");
				}
				processed.push(id);
			},
		});
		const worker = createNightlyWorker(deps);

		const result = await worker.tick();

		expect(result).toEqual({ ran: true, enqueued: 1, processed: 2 });
		expect(processed).toEqual(["task-2"]);
	});
});
