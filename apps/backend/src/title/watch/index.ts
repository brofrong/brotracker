import { eq } from "drizzle-orm";
import { db } from "../../db/db";
import { torrents } from "../../db/torrent/torrent.schema";
import {
	addTorrent,
	deleteTorrent,
	getTorrents,
	QbittorrentNotConfiguredError,
} from "../../qbittorent/qbittorent.client";
import { loadQbittorrentConfig } from "../../settings/qbittorrent-config";
import { getTrackerForTorrentId } from "../../torrent/torrent.tracker";
import { extractTopicId, torrentFileUrlFromId } from "../topic-tag";
import { isCompletePack } from "./episode-progress";
import { createNightlyWorker } from "./nightly-worker";
import { createReplaceTorrentInQb } from "./replace-torrent-in-qb";
import {
	loadWatchByTitleId,
	loadWatchByTopicUrl,
	saveWatch,
} from "./title-watch.repository";
import {
	appendWatchEvent,
	listRecentWatchEvents,
} from "./title-watch-event.repository";
import { createWatch } from "./watch";
import {
	createWatchTask,
	hasPendingWatchTask,
	listPendingWatchTaskIds,
	listTrackingWatches,
	loadWatchTask,
	saveWatchTask,
} from "./watch-task.repository";

export async function listQbTorrents() {
	try {
		const qbTorrents = await getTorrents();
		return qbTorrents.map((torrent) => ({
			hash: torrent.hash,
			name: torrent.name,
			savePath: torrent.save_path,
			tags: torrent.tags,
			size: torrent.size,
		}));
	} catch (error) {
		if (error instanceof QbittorrentNotConfiguredError) {
			return [];
		}
		throw error;
	}
}

async function getSeriesPath(): Promise<string | null> {
	const config = await loadQbittorrentConfig();
	const path = config?.seriesPath?.trim();
	return path ? path : null;
}

async function fetchTorrentBytes(torrentFileUrl: string): Promise<Uint8Array> {
	const topicId = extractTopicId(torrentFileUrl);
	if (!topicId) {
		throw new Error("Некорректный torrent URL");
	}
	const tracker = await getTrackerForTorrentId(topicId);
	const file = await tracker.getTorrent(torrentFileUrl);
	if (file.isErr()) {
		throw file.error;
	}
	return file.value;
}

async function fetchTopicMeta(topicUrl: string) {
	const topicId = extractTopicId(topicUrl);
	if (!topicId) {
		throw new Error("Некорректный topic URL");
	}

	const rows = await db
		.select()
		.from(torrents)
		.where(eq(torrents.torrentId, topicId))
		.limit(1);
	const row = rows[0];

	return {
		size: row?.size ?? 0,
		registeredAt: row?.registeredAt?.toISOString() ?? null,
		torrentFileUrl: row?.torrentFileUrl ?? torrentFileUrlFromId(topicId),
	};
}

const replaceInQb = createReplaceTorrentInQb({
	listTorrents: async () => {
		const qbTorrents = await getTorrents();
		return qbTorrents.map((torrent) => ({
			hash: torrent.hash,
			savePath: torrent.save_path,
			tags: torrent.tags,
		}));
	},
	deleteTorrent: (hash, options) => deleteTorrent(hash, options),
	addTorrent: (bytes, options) => addTorrent(bytes, options),
	getSeriesPath,
});

export const watch = createWatch({
	store: {
		loadByTopicUrl: loadWatchByTopicUrl,
		loadByTitleId: loadWatchByTitleId,
		save: saveWatch,
		listTracking: listTrackingWatches,
		appendEvent: appendWatchEvent,
		listRecentEvents: listRecentWatchEvents,
		createTask: createWatchTask,
		loadTask: loadWatchTask,
		saveTask: saveWatchTask,
		hasPending: hasPendingWatchTask,
		listPendingIds: listPendingWatchTaskIds,
	},
	transfers: {
		listQbTorrents,
		replaceInQb,
		getSeriesPath,
	},
	tracker: {
		fetchTorrentBytes,
		fetchTopicMeta,
	},
	isCompletePack,
	now: () => new Date().toISOString(),
});

export function getTitleWatchFeed(limit: number) {
	return watch.listRecentEvents(limit);
}

export const nightlyWorker = createNightlyWorker({
	sync: () => watch.syncFromQb(),
	enqueue: () => watch.enqueueNightly(),
	listPendingTaskIds: () => watch.listPendingTaskIds(),
	processTask: (taskId) => watch.processTask(taskId),
	now: () => new Date(),
});

export { createWatch } from "./watch";
export type { Watch, WatchDeps } from "./watch.types";
export {
	createNightlyWorker,
	type NightlyWorker,
	type NightlyRunNowResult,
	type NightlyTickResult,
} from "./nightly-worker";
