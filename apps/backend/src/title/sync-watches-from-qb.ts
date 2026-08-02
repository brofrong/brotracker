import type { TitleWatchRecord } from "./check-topic-now";
import { extractTopicIdFromTags, topicUrlFromId } from "./topic-tag";

export type SyncQbTorrent = {
	hash: string;
	name: string;
	savePath: string;
	tags: string;
	size: number;
};

export type SyncWatchesFromQbDeps = {
	listTorrents: () => Promise<SyncQbTorrent[]>;
	getSeriesPath: () => Promise<string | null>;
	loadWatch: (topicUrl: string) => Promise<TitleWatchRecord | null>;
	saveWatch: (record: TitleWatchRecord) => Promise<void>;
	/** #12 will provide real N/M parsing; default false until then. */
	isCompletePack: (torrentName: string) => boolean;
	now: () => string;
};

function isUnderSeriesPath(savePath: string, seriesPath: string): boolean {
	const normalizedSave = savePath.replace(/\/+$/u, "");
	const normalizedSeries = seriesPath.replace(/\/+$/u, "");
	return (
		normalizedSave === normalizedSeries ||
		normalizedSave.startsWith(`${normalizedSeries}/`)
	);
}

export async function syncWatchesFromQb(
	deps: SyncWatchesFromQbDeps,
): Promise<{ upserted: number }> {
	const seriesPath = await deps.getSeriesPath();
	if (!seriesPath) {
		return { upserted: 0 };
	}

	const torrents = await deps.listTorrents();
	let upserted = 0;

	for (const torrent of torrents) {
		if (!isUnderSeriesPath(torrent.savePath, seriesPath)) {
			continue;
		}

		const topicId = extractTopicIdFromTags(torrent.tags);
		if (!topicId) {
			continue;
		}

		const topicUrl = topicUrlFromId(topicId);
		const existing = await deps.loadWatch(topicUrl);

		if (!existing) {
			if (deps.isCompletePack(torrent.name)) {
				continue;
			}
			await deps.saveWatch({
				topicUrl,
				titleId: null,
				watch: "tracking",
				source: "auto-qb",
				size: torrent.size,
				registeredAt: null,
				contentHash: null,
				qbHash: torrent.hash,
				lastCheckedAt: null,
				lastChangedAt: null,
				lastError: null,
			});
			upserted += 1;
			continue;
		}

		if (
			existing.watch === "paused" ||
			existing.watch === "completed" ||
			existing.watch === "off"
		) {
			await deps.saveWatch({
				...existing,
				qbHash: torrent.hash,
				size: existing.size ?? torrent.size,
			});
			continue;
		}

		await deps.saveWatch({
			...existing,
			qbHash: torrent.hash,
			size: existing.size ?? torrent.size,
		});
		upserted += 1;
	}

	return { upserted };
}
