import { eq } from "drizzle-orm";
import { catalog } from "../catalog";
import type { CatalogSearchResult } from "../catalog";
import { db } from "../db/db";
import { torrents } from "../db/torrent/torrent.schema";
import { fetchWithProxy } from "../http/fetch-with-proxy";
import { toLiveTorrent } from "../qbittorent/live-torrent";
import {
	addTorrent,
	deleteTorrent,
	getTorrents,
	QbittorrentNotConfiguredError,
} from "../qbittorent/qbittorent.client";
import { addFromTracker } from "../qbittorent/qbittorent.service";
import {
	resolveTmdbCredentials,
	type TmdbCredentials,
} from "../settings/provider-settings";
import { loadQbittorrentConfig } from "../settings/qbittorrent-config";
import { getTracker } from "../torrent/torrent.tracker";
import { logger } from "../utils/logger";
import { createDefaultRatingsPort } from "./ratings-port";
import { createTitleModule, TitleAddError, TitleWatchError } from "./title";
import type {
	FetchTmdbMetaOutcome,
	TitleKind,
	TitleTorrentCandidate,
	TitleTorrentsSearch,
} from "./title.types";
import { createTmdbBrowse } from "../tmdb/browse";
import {
	parseMovieDetails,
	parseSimilar,
	parseTvDetails,
	type TmdbCredits,
	type TmdbMovieDetails,
	type TmdbSimilarResponse,
	type TmdbTvDetails,
} from "./tmdb-meta";
import { extractTopicId, torrentFileUrlFromId } from "./topic-tag";
import { checkTopicNow, type RecordWatchEventInput } from "./watch/check-topic-now";
import { enqueueNightlyWatchTasks } from "./watch/enqueue-nightly-tasks";
import { isCompletePack } from "./watch/episode-progress";
import { createNightlyWorker } from "./watch/nightly-worker";
import { processWatchTask } from "./watch/process-watch-task";
import { createReplaceTorrentInQb } from "./watch/replace-torrent-in-qb";
import { syncWatchesFromQb } from "./watch/sync-watches-from-qb";
import {
	loadWatchByTitleId,
	loadWatchByTopicUrl,
	saveWatch,
} from "./watch/title-watch.repository";
import {
	appendWatchEvent,
	listRecentWatchEvents,
} from "./watch/title-watch-event.repository";
import {
	createWatchTask,
	hasPendingWatchTask,
	listPendingWatchTaskIds,
	listTrackingWatches,
	loadWatchTask,
	saveWatchTask,
} from "./watch/watch-task.repository";

const TMDB_BASE = "https://api.themoviedb.org/3";

function tmdbAuthQuery(apiKey: string): string {
	return `api_key=${encodeURIComponent(apiKey)}`;
}

async function fetchTmdbJson<T>(
	path: string,
	credentials: TmdbCredentials,
): Promise<T | null> {
	const url = `${TMDB_BASE}${path}${
		path.includes("?") ? "&" : "?"
	}${tmdbAuthQuery(credentials.apiKey)}&language=ru-RU`;

	try {
		const response = await fetchWithProxy(url, {
			headers: {
				Accept: "application/json",
			},
			proxyUrl: credentials.proxyUrl,
		});

		if (!response.ok) {
			logger.warn({ path, status: response.status }, "tmdb fetch failed");
			return null;
		}

		return (await response.json()) as T;
	} catch (err) {
		logger.warn(
			{ path, err: err instanceof Error ? err.message : String(err) },
			"tmdb fetch error",
		);
		return null;
	}
}

export function createFetchTmdbMeta(
	resolveCredentials: () => Promise<TmdbCredentials | undefined>,
): (kind: TitleKind, tmdbId: number) => Promise<FetchTmdbMetaOutcome> {
	return async (kind, tmdbId) => {
		const credentials = await resolveCredentials();
		if (!credentials) {
			return { status: "unavailable" };
		}

		const segment = kind === "films" ? "movie" : "tv";
		const detailsPath = `/${segment}/${tmdbId}`;
		const creditsPath = `/${segment}/${tmdbId}/credits`;
		const similarPath = `/${segment}/${tmdbId}/similar`;

		const [details, credits, similar] = await Promise.all([
			fetchTmdbJson<TmdbMovieDetails | TmdbTvDetails>(detailsPath, credentials),
			fetchTmdbJson<TmdbCredits>(creditsPath, credentials),
			fetchTmdbJson<TmdbSimilarResponse>(similarPath, credentials),
		]);

		if (!details || !credits) {
			return { status: "error" };
		}

		const parsed =
			kind === "films"
				? parseMovieDetails(details as TmdbMovieDetails, credits)
				: parseTvDetails(details as TmdbTvDetails, credits);

		return {
			status: "ok",
			meta: { ...parsed, similar: parseSimilar(similar, kind) },
		};
	};
}

function toCandidate(hit: CatalogSearchResult): TitleTorrentCandidate {
	return {
		torrentId: hit.torrentId,
		title: hit.title,
		size: hit.size,
		seeds: hit.seeds,
		leeches: hit.leeches,
		torrentFileUrl: hit.torrentFileUrl,
		topicUrl: hit.topicUrl,
		hdr: hit.hdr,
		resolution: hit.resolution,
		forumId: hit.forumId,
	};
}

async function searchTorrentsForTitle(
	query: string,
): Promise<TitleTorrentsSearch> {
	const localPromise = catalog.search(query).then((page) =>
		page.results.map(toCandidate),
	);

	try {
		const [local, trackerPage] = await Promise.all([
			localPromise,
			catalog.searchRefresh(query, {}),
		]);
		return {
			status: "ok",
			local,
			tracker: trackerPage.results.map(toCandidate),
		};
	} catch (err) {
		const local = await localPromise;
		const trackerError =
			err instanceof Error && err.message === "Tracker unavailable"
				? "unavailable"
				: "error";
		logger.warn(
			{
				err: err instanceof Error ? err.message : String(err),
				query,
				trackerError,
			},
			"title.torrents: tracker search degraded",
		);
		return { status: "degraded", local, trackerError };
	}
}

async function listTaggedTorrents() {
	try {
		const qbTorrents = await getTorrents();
		return qbTorrents.map((torrent) => {
			const live = toLiveTorrent(torrent);
			return {
				hash: live.id,
				progress: live.progress,
				stateKind: live.stateKind,
				stateLabel: live.stateLabel,
				downloadSpeed: live.downloadSpeed,
				etaSeconds: live.etaSeconds,
				tags: live.tags,
			};
		});
	} catch (error) {
		if (error instanceof QbittorrentNotConfiguredError) {
			return [];
		}
		throw error;
	}
}

async function listQbTorrents() {
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
	const tracker = await getTracker();
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

async function recordWatchEvent(event: RecordWatchEventInput): Promise<void> {
	await appendWatchEvent({
		id: crypto.randomUUID(),
		titleId: event.titleId,
		topicUrl: event.topicUrl,
		kind: event.kind,
		message: event.message,
		previousSize: event.previousSize ?? null,
		newSize: event.newSize ?? null,
		createdAt: new Date().toISOString(),
	});
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

const ratingsPort = createDefaultRatingsPort();

const now = () => new Date().toISOString();

async function checkTopicNowBound(input: { topicUrl: string }) {
	return checkTopicNow(input, {
		loadWatch: loadWatchByTopicUrl,
		saveWatch,
		fetchTorrentBytes,
		fetchTopicMeta,
		replaceInQb,
		now,
		recordEvent: recordWatchEvent,
	});
}

/** The single path both the nightly worker and manual checkNow drain through. */
async function processWatchTaskById(taskId: string) {
	return processWatchTask(
		{ taskId },
		{
			loadTask: loadWatchTask,
			saveTask: saveWatchTask,
			checkTopicNow: checkTopicNowBound,
			now,
		},
	);
}

export const titleModule = createTitleModule({
	fetchTmdbMeta: createFetchTmdbMeta(resolveTmdbCredentials),
	getRatings: ratingsPort.getRatings,
	searchTorrents: searchTorrentsForTitle,
	listTaggedTorrents,
	addFromTracker: async (torrentFileUrl, kind, tags) => {
		await addFromTracker(torrentFileUrl, kind, tags);
	},
	loadWatchByTopicUrl,
	loadWatchByTitleId,
	saveWatch,
	listQbTorrents,
	getSeriesPath,
	fetchTorrentBytes,
	fetchTopicMeta,
	replaceInQb,
	isCompletePack,
	now,
	recordEvent: recordWatchEvent,
	enqueueWatchTask: createWatchTask,
	processWatchTask: processWatchTaskById,
});

export const tmdbBrowse = createTmdbBrowse({
	resolveCredentials: resolveTmdbCredentials,
});

export function getTitleWatchFeed(limit: number) {
	return listRecentWatchEvents(limit);
}

export const nightlyWorker = createNightlyWorker({
	sync: () =>
		syncWatchesFromQb({
			listTorrents: listQbTorrents,
			getSeriesPath,
			loadWatch: loadWatchByTopicUrl,
			saveWatch,
			isCompletePack,
			now,
			recordEvent: recordWatchEvent,
		}),
	enqueue: () =>
		enqueueNightlyWatchTasks({
			listTrackingWatches,
			hasPendingTask: hasPendingWatchTask,
			createTask: createWatchTask,
		}),
	listPendingTaskIds: listPendingWatchTaskIds,
	processTask: processWatchTaskById,
	now: () => new Date(),
});

export { createTitleModule, TitleAddError, TitleWatchError };
