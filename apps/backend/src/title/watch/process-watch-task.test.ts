import { describe, expect, test } from "bun:test";
import { processWatchTask, type WatchTask } from "./process-watch-task";

function task(partial: Partial<WatchTask> = {}): WatchTask {
	return {
		id: "task-1",
		topicUrl: "https://rutracker.org/forum/viewtopic.php?t=55",
		titleId: "tmdb:tv:1",
		trigger: "nightly",
		status: "pending",
		error: null,
		createdAt: "2026-08-02T03:00:00.000Z",
		startedAt: null,
		finishedAt: null,
		...partial,
	};
}

function createStore(initial: WatchTask) {
	const store = new Map<string, WatchTask>([[initial.id, initial]]);
	const saved: WatchTask[] = [];
	return {
		store,
		saved,
		loadTask: async (id: string) => store.get(id) ?? null,
		saveTask: async (updated: WatchTask) => {
			store.set(updated.id, updated);
			saved.push(updated);
		},
	};
}

describe("processWatchTask", () => {
	test("transitions pending -> running -> succeeded and runs checkTopicNow", async () => {
		const { loadTask, saveTask, saved } = createStore(task());
		const checkedTopics: string[] = [];

		const result = await processWatchTask(
			{ taskId: "task-1" },
			{
				loadTask,
				saveTask,
				checkTopicNow: async (input) => {
					checkedTopics.push(input.topicUrl);
					return { status: "unchanged", checkedAt: "2026-08-02T03:00:05.000Z" };
				},
				now: () => "2026-08-02T03:00:05.000Z",
			},
		);

		expect(checkedTopics).toEqual([
			"https://rutracker.org/forum/viewtopic.php?t=55",
		]);
		expect(saved.map((t) => t.status)).toEqual(["running", "succeeded"]);
		const succeededTask = saved[1];
		if (!succeededTask) {
			throw new Error("expected a second saved task");
		}
		expect(result).toEqual({
			outcome: "processed",
			task: succeededTask,
			checkResult: {
				status: "unchanged",
				checkedAt: "2026-08-02T03:00:05.000Z",
			},
		});
		expect(succeededTask.startedAt).toBe("2026-08-02T03:00:05.000Z");
		expect(succeededTask.finishedAt).toBe("2026-08-02T03:00:05.000Z");
	});

	test("stores error and marks failed when checkTopicNow reports failure", async () => {
		const { loadTask, saveTask, saved } = createStore(task());

		const result = await processWatchTask(
			{ taskId: "task-1" },
			{
				loadTask,
				saveTask,
				checkTopicNow: async () => ({
					status: "failed",
					checkedAt: "2026-08-02T03:00:05.000Z",
					message: "tracker down",
				}),
				now: () => "2026-08-02T03:00:05.000Z",
			},
		);

		expect(saved.map((t) => t.status)).toEqual(["running", "failed"]);
		expect(saved[1]?.error).toBe("tracker down");
		if (result.outcome === "processed") {
			expect(result.checkResult.status).toBe("failed");
		} else {
			throw new Error("expected outcome processed");
		}
	});

	test("isolates unexpected throws from checkTopicNow as a failed task", async () => {
		const { loadTask, saveTask, saved } = createStore(task());

		const result = await processWatchTask(
			{ taskId: "task-1" },
			{
				loadTask,
				saveTask,
				checkTopicNow: async () => {
					throw new Error("boom");
				},
				now: () => "2026-08-02T03:00:05.000Z",
			},
		);

		expect(saved.map((t) => t.status)).toEqual(["running", "failed"]);
		expect(saved[1]?.error).toBe("boom");
		expect(result.outcome).toBe("processed");
	});

	test("skips already-running tasks (idempotent)", async () => {
		const { loadTask, saveTask, saved } = createStore(
			task({ status: "running", startedAt: "2026-08-02T03:00:00.000Z" }),
		);

		const result = await processWatchTask(
			{ taskId: "task-1" },
			{
				loadTask,
				saveTask,
				checkTopicNow: async () => {
					throw new Error("should not be called");
				},
				now: () => "2026-08-02T03:00:05.000Z",
			},
		);

		expect(saved).toEqual([]);
		expect(result.outcome).toBe("skipped");
	});

	test("skips already-succeeded tasks (idempotent)", async () => {
		const { loadTask, saveTask, saved } = createStore(
			task({ status: "succeeded", finishedAt: "2026-08-02T03:00:00.000Z" }),
		);

		const result = await processWatchTask(
			{ taskId: "task-1" },
			{
				loadTask,
				saveTask,
				checkTopicNow: async () => {
					throw new Error("should not be called");
				},
				now: () => "2026-08-02T03:00:05.000Z",
			},
		);

		expect(saved).toEqual([]);
		expect(result.outcome).toBe("skipped");
	});

	test("reports not_found for a missing task id", async () => {
		const { loadTask, saveTask, saved } = createStore(task());

		const result = await processWatchTask(
			{ taskId: "does-not-exist" },
			{
				loadTask,
				saveTask,
				checkTopicNow: async () => ({
					status: "unchanged",
					checkedAt: "2026-08-02T03:00:05.000Z",
				}),
				now: () => "2026-08-02T03:00:05.000Z",
			},
		);

		expect(saved).toEqual([]);
		expect(result).toEqual({ outcome: "not_found" });
	});
});
