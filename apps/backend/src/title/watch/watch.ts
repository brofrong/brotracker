import {
	checkTopicNow,
	type CheckResult,
	type RecordWatchEventInput,
} from "./check-topic-now";
import { enqueueNightlyWatchTasks } from "./enqueue-nightly-tasks";
import { processWatchTask } from "./process-watch-task";
import { syncWatchesFromQb } from "./sync-watches-from-qb";
import type { Watch, WatchDeps } from "./watch.types";

export function createWatch(deps: WatchDeps): Watch {
	async function recordEvent(event: RecordWatchEventInput): Promise<void> {
		await deps.store.appendEvent({
			id: crypto.randomUUID(),
			titleId: event.titleId,
			topicUrl: event.topicUrl,
			kind: event.kind,
			message: event.message,
			previousSize: event.previousSize ?? null,
			newSize: event.newSize ?? null,
			createdAt: deps.now(),
		});
	}

	async function checkTopicNowBound(input: {
		topicUrl: string;
	}): Promise<CheckResult> {
		return checkTopicNow(input, {
			loadWatch: deps.store.loadByTopicUrl,
			saveWatch: deps.store.save,
			fetchTorrentBytes: deps.tracker.fetchTorrentBytes,
			fetchTopicMeta: deps.tracker.fetchTopicMeta,
			replaceInQb: deps.transfers.replaceInQb,
			now: deps.now,
			recordEvent,
		});
	}

	async function processTask(taskId: string) {
		return processWatchTask(
			{ taskId },
			{
				loadTask: deps.store.loadTask,
				saveTask: deps.store.saveTask,
				checkTopicNow: checkTopicNowBound,
				now: deps.now,
			},
		);
	}

	async function syncFromQb() {
		return syncWatchesFromQb({
			listTorrents: deps.transfers.listQbTorrents,
			getSeriesPath: deps.transfers.getSeriesPath,
			loadWatch: deps.store.loadByTopicUrl,
			saveWatch: deps.store.save,
			isCompletePack: deps.isCompletePack,
			now: deps.now,
			recordEvent,
		});
	}

	async function enqueueNightly() {
		return enqueueNightlyWatchTasks({
			listTrackingWatches: deps.store.listTracking,
			hasPendingTask: deps.store.hasPending,
			createTask: deps.store.createTask,
		});
	}

	return {
		syncFromQb,
		processTask,
		checkTopicNow: checkTopicNowBound,
		enqueueTask: deps.store.createTask,
		enqueueNightly,
		listPendingTaskIds: deps.store.listPendingIds,
		loadByTopicUrl: deps.store.loadByTopicUrl,
		loadByTitleId: deps.store.loadByTitleId,
		save: deps.store.save,
		isCompletePack: deps.isCompletePack,
		now: deps.now,
		listRecentEvents: deps.store.listRecentEvents,
		recordEvent,
	};
}

export type { Watch, WatchDeps } from "./watch.types";
