import { extractTopicIdFromTags, topicUrlFromId } from "../topic-tag";
import type { RecordWatchEvent, TitleWatchRecord } from "./check-topic-now";
import { parseEpisodeProgress } from "./episode-progress";

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
	isCompletePack: (torrentName: string) => boolean;
	now: () => string;
	/** Optional feed hook (#13); failures must not break sync. */
	recordEvent?: RecordWatchEvent;
};

async function tryRecordEvent(
	recordEvent: RecordWatchEvent | undefined,
	event: Parameters<RecordWatchEvent>[0],
): Promise<void> {
	if (!recordEvent) {
		return;
	}
	try {
		await recordEvent(event);
	} catch {
		// best-effort
	}
}

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
				id: crypto.randomUUID(),
				topicUrl,
				titleId: null,
				kind: "tv",
				watch: "tracking",
				source: "auto-qb",
				season: null,
				titleName: null,
				poster: null,
				year: null,
				size: torrent.size,
				registeredAt: null,
				contentHash: null,
				qbHash: torrent.hash,
				lastCheckedAt: null,
				lastChangedAt: null,
				lastError: null,
				waitingOutcome: null,
				waitingOutcomeDetail: null,
				createdAt: deps.now(),
			});
			upserted += 1;
			continue;
		}

		// Only tracking watches progress here; paused/completed/off and the
		// watchlist states (waiting/downloading) just get the live qB hash.
		if (existing.watch !== "tracking") {
			await deps.saveWatch({
				...existing,
				qbHash: torrent.hash,
				size: existing.size ?? torrent.size,
			});
			continue;
		}

		const justCompleted = deps.isCompletePack(torrent.name);
		await deps.saveWatch({
			...existing,
			qbHash: torrent.hash,
			size: existing.size ?? torrent.size,
			watch: justCompleted ? "completed" : existing.watch,
		});

		if (justCompleted) {
			const progress = parseEpisodeProgress(torrent.name);
			await tryRecordEvent(deps.recordEvent, {
				titleId: existing.titleId,
				topicUrl,
				kind: "completed",
				message: progress ? `${progress.have} из ${progress.total}` : null,
			});
		} else {
			upserted += 1;
		}
	}

	return { upserted };
}
