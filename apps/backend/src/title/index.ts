import { toLiveTorrent } from "../qbittorent/live-torrent";
import {
	getTorrents,
	QbittorrentNotConfiguredError,
} from "../qbittorent/qbittorent.client";
import { addFromTracker } from "../qbittorent/qbittorent.service";
import { resolveTmdbApiKey } from "../settings/provider-settings";
import { normalizeTitle } from "../torrent/title-norm";
import { searchLocal, upsertFromTracker } from "../torrent/torrent.repository";
import { getTracker } from "../torrent/torrent.tracker";
import { logger } from "../utils/logger";
import { createDefaultRatingsPort } from "./ratings-port";
import { createTitleModule, TitleAddError } from "./title";
import type {
	FetchTmdbMetaOutcome,
	TitleKind,
	TitleTorrentCandidate,
	TrackerSearchForTitle,
} from "./title.types";
import {
	parseMovieDetails,
	parseTvDetails,
	type TmdbCredits,
	type TmdbMovieDetails,
	type TmdbTvDetails,
} from "./tmdb-meta";

const TMDB_BASE = "https://api.themoviedb.org/3";

function tmdbAuthQuery(apiKey: string): string {
	return `api_key=${encodeURIComponent(apiKey)}`;
}

async function fetchTmdbJson<T>(
	path: string,
	apiKey: string,
): Promise<T | null> {
	const url = `${TMDB_BASE}${path}${
		path.includes("?") ? "&" : "?"
	}${tmdbAuthQuery(apiKey)}&language=ru-RU`;

	try {
		const response = await fetch(url, {
			headers: {
				Accept: "application/json",
			},
		});

		if (!response.ok) {
			logger.warn(
				{ path, status: response.status },
				"tmdb fetch failed",
			);
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
	resolveApiKey: () => Promise<string | undefined>,
): (kind: TitleKind, tmdbId: number) => Promise<FetchTmdbMetaOutcome> {
	return async (kind, tmdbId) => {
		const apiKey = await resolveApiKey();
		if (!apiKey) {
			return { status: "unavailable" };
		}

		const segment = kind === "films" ? "movie" : "tv";
		const detailsPath = `/${segment}/${tmdbId}`;
		const creditsPath = `/${segment}/${tmdbId}/credits`;

		const [details, credits] = await Promise.all([
			fetchTmdbJson<TmdbMovieDetails | TmdbTvDetails>(detailsPath, apiKey),
			fetchTmdbJson<TmdbCredits>(creditsPath, apiKey),
		]);

		if (!details || !credits) {
			return { status: "error" };
		}

		const meta =
			kind === "films"
				? parseMovieDetails(details as TmdbMovieDetails, credits)
				: parseTvDetails(details as TmdbTvDetails, credits);

		return { status: "ok", meta };
	};
}

function toCandidate(hit: {
	torrentId: string;
	title: string;
	size: number;
	seeds: number;
	leeches: number;
	torrentFileUrl: string;
	topicUrl: string;
	hdr: "HDR" | "SDR" | null;
	resolution: "4K" | "1080p" | "720p" | "SD" | null;
	forumId: string;
}): TitleTorrentCandidate {
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

async function searchLocalForTitle(
	query: string,
): Promise<TitleTorrentCandidate[]> {
	const hits = await searchLocal(normalizeTitle(query));
	return hits.map(toCandidate);
}

async function searchTrackerForTitle(
	query: string,
): Promise<TrackerSearchForTitle> {
	let tracker;
	try {
		tracker = await getTracker();
	} catch (err) {
		logger.warn(
			{ err: err instanceof Error ? err.message : String(err), query },
			"title.torrents: tracker unavailable",
		);
		return { status: "unavailable" };
	}

	const page = await tracker.search(query, {});
	if (page.isErr()) {
		logger.warn(
			{ err: page.error.message, query },
			"title.torrents: tracker search failed",
		);
		return { status: "error" };
	}

	await upsertFromTracker(page.value.results);
	return {
		status: "ok",
		results: page.value.results.map(toCandidate),
	};
}

const ratingsPort = createDefaultRatingsPort();

export const titleModule = createTitleModule({
	fetchTmdbMeta: createFetchTmdbMeta(resolveTmdbApiKey),
	getRatings: ratingsPort.getRatings,
	searchLocal: searchLocalForTitle,
	searchTracker: searchTrackerForTitle,
	listTaggedTorrents: async () => {
		try {
			const torrents = await getTorrents();
			return torrents.map((torrent) => {
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
	},
	addFromTracker: async (torrentFileUrl, kind, tags) => {
		await addFromTracker(torrentFileUrl, kind, tags);
	},
});

export { createTitleModule, TitleAddError };
