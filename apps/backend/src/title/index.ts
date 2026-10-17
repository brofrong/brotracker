import type { CatalogSearchResult } from "../catalog";
import { catalog } from "../catalog";
import { toLiveTorrent } from "../qbittorent/live-torrent";
import {
	getTorrents,
	QbittorrentNotConfiguredError,
} from "../qbittorent/qbittorent.client";
import { addFromTracker } from "../qbittorent/qbittorent.service";
import { resolveTmdbCredentials } from "../settings/provider-settings";
import { loadWatchlistSettings } from "../settings/watchlist-settings";
import { createTmdbBrowse } from "../tmdb/browse";
import { logger } from "../utils/logger";
import { createFetchTmdbMeta } from "./fetch-tmdb-meta";
import { createDefaultRatingsPort } from "./ratings-port";
import {
	createTitleModule,
	TitleAddError,
	TitleLinkError,
	TitleWatchError,
} from "./title";
import type { TitleTorrentCandidate, TitleTorrentsSearch } from "./title.types";
import { loadAllLinks, upsertLink } from "./title-link.repository";
import { createWaitingSearch } from "./waiting-search";
import { buildWaitingTarget } from "./waiting-target";
import {
	deleteWatch,
	getTitleWatchFeed,
	listQbTorrents,
	listTitledWatches,
	listWatchesByState,
	listWatchlistRecords,
	loadWatchById,
	nightlyWorker,
	watch,
} from "./watch";
import { createWatchlist, WatchlistError } from "./watchlist";

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
	const localPromise = catalog
		.search(query)
		.then((page) => page.results.map(toCandidate));

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
	deleteWatch,
	recordEvent: watch.recordEvent,
	listQbTorrents,
	now: watch.now,
	enqueueWatchTask: watch.enqueueTask,
	processWatchTask: watch.processTask,
	upsertLink,
	loadAllLinks,
	listTitledWatches,
});

/** Tracker-only search for «Жду»; throws when the trackers are unavailable. */
async function searchTracker(query: string): Promise<TitleTorrentCandidate[]> {
	const page = await catalog.searchRefresh(query, {});
	return page.results.map(toCandidate);
}

/** Watch search metadata always comes from TMDB `ru-RU` (Russian name for queries). */
const getTitleRu = (titleId: string) =>
	titleModule.get({ id: titleId, language: "ru-RU" });

export const waitingSearch = createWaitingSearch({
	listWaiting: () => listWatchesByState(["waiting"]),
	listDownloading: () => listWatchesByState(["downloading"]),
	loadWatchById,
	loadWatchByTopicUrl: watch.loadByTopicUrl,
	saveWatch: watch.save,
	deleteWatch,
	loadTarget: async (record) =>
		record.titleId
			? buildWaitingTarget(await getTitleRu(record.titleId), record)
			: null,
	searchTracker,
	loadRules: loadWatchlistSettings,
	addToQb: async (torrentFileUrl, kind, tags) => {
		await addFromTracker(torrentFileUrl, kind, tags);
	},
	listTaggedTorrents,
	recordEvent: watch.recordEvent,
	now: watch.now,
});

export const watchlist = createWatchlist({
	getTitle: getTitleRu,
	loadWatchByTitleId: watch.loadByTitleId,
	loadWatchById,
	listWatchlistRecords,
	saveWatch: watch.save,
	deleteWatch,
	listTaggedTorrents,
	listQbTorrents,
	checkWaiting: (watchId) => waitingSearch.checkOne(watchId),
	checkTracking: (target) => titleModule.checkTopic(target),
	now: watch.now,
	newId: () => crypto.randomUUID(),
});

export const tmdbBrowse = createTmdbBrowse({
	resolveCredentials: resolveTmdbCredentials,
});

export { createFetchTmdbMeta } from "./fetch-tmdb-meta";
export type { WaitingSearchRun } from "./waiting-search";
export type { WatchlistItem } from "./watchlist";
export {
	createTitleModule,
	getTitleWatchFeed,
	nightlyWorker,
	TitleAddError,
	TitleLinkError,
	TitleWatchError,
	WatchlistError,
};
