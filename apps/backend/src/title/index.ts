import { catalog } from "../catalog";
import type { CatalogSearchResult } from "../catalog";
import { toLiveTorrent } from "../qbittorent/live-torrent";
import {
	getTorrents,
	QbittorrentNotConfiguredError,
} from "../qbittorent/qbittorent.client";
import { addFromTracker } from "../qbittorent/qbittorent.service";
import { resolveTmdbCredentials } from "../settings/provider-settings";
import { createTmdbBrowse } from "../tmdb/browse";
import { logger } from "../utils/logger";
import { createFetchTmdbMeta } from "./fetch-tmdb-meta";
import { createDefaultRatingsPort } from "./ratings-port";
import { createTitleModule, TitleAddError, TitleWatchError } from "./title";
import type {
	TitleTorrentCandidate,
	TitleTorrentsSearch,
} from "./title.types";
import {
	getTitleWatchFeed,
	listQbTorrents,
	nightlyWorker,
	watch,
} from "./watch";

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
	now: watch.now,
	enqueueWatchTask: watch.enqueueTask,
	processWatchTask: watch.processTask,
});

export const tmdbBrowse = createTmdbBrowse({
	resolveCredentials: resolveTmdbCredentials,
});

export { getTitleWatchFeed, nightlyWorker };
export { createTitleModule, TitleAddError, TitleWatchError };
export { createFetchTmdbMeta } from "./fetch-tmdb-meta";
