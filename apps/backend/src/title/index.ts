import { catalog } from "../catalog";
import type { CatalogSearchResult } from "../catalog";
import { fetchWithProxy } from "../http/fetch-with-proxy";
import { toLiveTorrent } from "../qbittorent/live-torrent";
import {
	getTorrents,
	QbittorrentNotConfiguredError,
} from "../qbittorent/qbittorent.client";
import { addFromTracker } from "../qbittorent/qbittorent.service";
import {
	resolveTmdbCredentials,
	type TmdbCredentials,
} from "../settings/provider-settings";
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
import {
	getTitleWatchFeed,
	listQbTorrents,
	nightlyWorker,
	watch,
} from "./watch";

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

const ratingsPort = createDefaultRatingsPort();

export const titleModule = createTitleModule({
	fetchTmdbMeta: createFetchTmdbMeta(resolveTmdbCredentials),
	getRatings: ratingsPort.getRatings,
	searchTorrents: searchTorrentsForTitle,
	listTaggedTorrents,
	addFromTracker: async (torrentFileUrl, kind, tags) => {
		await addFromTracker(torrentFileUrl, kind, tags);
	},
	loadWatchByTopicUrl: watch.loadByTopicUrl,
	loadWatchByTitleId: watch.loadByTitleId,
	saveWatch: watch.save,
	listQbTorrents,
	syncFromQb: async () => {
		await watch.syncFromQb();
	},
	getSeriesPath: async () => null,
	fetchTorrentBytes: async () => new Uint8Array(),
	fetchTopicMeta: async () => ({
		size: 0,
		registeredAt: null,
		torrentFileUrl: "",
	}),
	replaceInQb: async () => {},
	isCompletePack: watch.isCompletePack,
	now: watch.now,
	recordEvent: watch.recordEvent,
	enqueueWatchTask: watch.enqueueTask,
	processWatchTask: watch.processTask,
});

export const tmdbBrowse = createTmdbBrowse({
	resolveCredentials: resolveTmdbCredentials,
});

export { getTitleWatchFeed, nightlyWorker };
export { createTitleModule, TitleAddError, TitleWatchError };
