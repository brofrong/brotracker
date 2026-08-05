import type { WatchTask, WatchTaskTrigger } from "./process-watch-task";

export type TrackingWatchRef = {
	topicUrl: string;
	titleId: string | null;
};

export type EnqueueNightlyWatchTasksDeps = {
	listTrackingWatches: () => Promise<TrackingWatchRef[]>;
	hasPendingTask: (topicUrl: string) => Promise<boolean>;
	createTask: (input: {
		topicUrl: string;
		titleId: string | null;
		trigger: WatchTaskTrigger;
	}) => Promise<WatchTask>;
};

/**
 * After a qB sync, creates pending WatchTask rows for every `watch=tracking`
 * title. Skips topics that already have a pending task so a slow night
 * (or repeated ticks) never stacks duplicate pending work for the same topic.
 */
export async function enqueueNightlyWatchTasks(
	deps: EnqueueNightlyWatchTasksDeps,
): Promise<{ enqueued: number }> {
	const watches = await deps.listTrackingWatches();
	let enqueued = 0;

	for (const watch of watches) {
		if (await deps.hasPendingTask(watch.topicUrl)) {
			continue;
		}
		await deps.createTask({
			topicUrl: watch.topicUrl,
			titleId: watch.titleId,
			trigger: "nightly",
		});
		enqueued += 1;
	}

	return { enqueued };
}
