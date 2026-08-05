import { describe, expect, test } from "bun:test";
import { enqueueNightlyWatchTasks } from "./enqueue-nightly-tasks";
import type { WatchTask } from "./process-watch-task";

describe("enqueueNightlyWatchTasks", () => {
	test("creates a pending task for each tracking watch", async () => {
		const created: { topicUrl: string; titleId: string | null }[] = [];

		const result = await enqueueNightlyWatchTasks({
			listTrackingWatches: async () => [
				{
					topicUrl: "https://rutracker.org/forum/viewtopic.php?t=1",
					titleId: "tmdb:tv:1",
				},
				{
					topicUrl: "https://rutracker.org/forum/viewtopic.php?t=2",
					titleId: null,
				},
			],
			hasPendingTask: async () => false,
			createTask: async (input) => {
				created.push({ topicUrl: input.topicUrl, titleId: input.titleId });
				return {
					id: `task-${created.length}`,
					topicUrl: input.topicUrl,
					titleId: input.titleId,
					trigger: input.trigger,
					status: "pending",
					error: null,
					createdAt: "2026-08-02T03:00:00.000Z",
					startedAt: null,
					finishedAt: null,
				} satisfies WatchTask;
			},
		});

		expect(result.enqueued).toBe(2);
		expect(created).toEqual([
			{
				topicUrl: "https://rutracker.org/forum/viewtopic.php?t=1",
				titleId: "tmdb:tv:1",
			},
			{
				topicUrl: "https://rutracker.org/forum/viewtopic.php?t=2",
				titleId: null,
			},
		]);
	});

	test("dedups: skips topics that already have a pending task", async () => {
		const created: string[] = [];

		const result = await enqueueNightlyWatchTasks({
			listTrackingWatches: async () => [
				{
					topicUrl: "https://rutracker.org/forum/viewtopic.php?t=1",
					titleId: null,
				},
			],
			hasPendingTask: async (topicUrl) =>
				topicUrl === "https://rutracker.org/forum/viewtopic.php?t=1",
			createTask: async (input) => {
				created.push(input.topicUrl);
				return {
					id: "task-1",
					topicUrl: input.topicUrl,
					titleId: input.titleId,
					trigger: input.trigger,
					status: "pending",
					error: null,
					createdAt: "2026-08-02T03:00:00.000Z",
					startedAt: null,
					finishedAt: null,
				} satisfies WatchTask;
			},
		});

		expect(result.enqueued).toBe(0);
		expect(created).toEqual([]);
	});

	test("stamps nightly trigger on created tasks", async () => {
		const triggers: string[] = [];

		await enqueueNightlyWatchTasks({
			listTrackingWatches: async () => [
				{
					topicUrl: "https://rutracker.org/forum/viewtopic.php?t=1",
					titleId: null,
				},
			],
			hasPendingTask: async () => false,
			createTask: async (input) => {
				triggers.push(input.trigger);
				return {
					id: "task-1",
					topicUrl: input.topicUrl,
					titleId: input.titleId,
					trigger: input.trigger,
					status: "pending",
					error: null,
					createdAt: "2026-08-02T03:00:00.000Z",
					startedAt: null,
					finishedAt: null,
				} satisfies WatchTask;
			},
		});

		expect(triggers).toEqual(["nightly"]);
	});
});
