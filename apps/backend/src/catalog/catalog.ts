import {
	parseTorrentId,
	type TrackerSource,
} from "@brotracker/rutracker-ts/tracker/torrent-id";
import type {
	SearchOptions,
	SearchResult,
} from "@brotracker/rutracker-ts/tracker/tracker-interface";
import { compareTorrentQuality } from "../torrent/quality-score";
import type { LocalCatalogHit } from "../torrent/torrent.types";
import type { TrackerFailure } from "../torrent/tracker-error";

export type { LocalCatalogHit } from "../torrent/torrent.types";

export type CatalogSearchResult = SearchResult & {
	imageUrl: string | null;
};

export type CatalogSearchResponse = {
	results: CatalogSearchResult[];
	totalResults: number | null;
};

export type CatalogRefreshResponse = CatalogSearchResponse & {
	/** Trackers that failed during this refresh (others may still have answered). */
	trackerFailures: TrackerFailure[];
	/**
	 * Trackers still searching after the deadline; their cached local hits are
	 * included meanwhile. Repeat the refresh to pick up their answer.
	 */
	pendingSources: TrackerSource[];
};

export type TrackerSearchControl = {
	/** Stop waiting for slow trackers after this long and report them as pending. */
	deadlineMs?: number;
};

export type TrackerSearchOutcome =
	| {
			status: "ok";
			results: SearchResult[];
			totalResults: number | null;
			failures: TrackerFailure[];
			pending?: TrackerSource[];
	  }
	| { status: "unavailable" }
	| { status: "error"; error: Error; failures: TrackerFailure[] };

/** Every enabled tracker failed; message is the first tracker's error. */
export class TrackerSearchError extends Error {
	readonly failures: TrackerFailure[];

	constructor(error: Error, failures: TrackerFailure[]) {
		super(error.message, { cause: error });
		this.name = "TrackerSearchError";
		this.failures = failures;
	}
}

export type CatalogDeps = {
	normalizeTitle: (query: string) => string;
	searchLocal: (queryNorm: string) => Promise<LocalCatalogHit[]>;
	listRecent: (limit: number) => Promise<LocalCatalogHit[]>;
	searchTracker: (
		query: string,
		options: Partial<SearchOptions>,
		control?: TrackerSearchControl,
	) => Promise<TrackerSearchOutcome>;
	upsertFromTracker: (results: SearchResult[]) => Promise<void>;
	loadImageKeys: (torrentIds: string[]) => Promise<Map<string, string | null>>;
	publicUrl: (key: string) => string;
	enqueueCoverFetch: (torrentIds: string[]) => void;
};

export function createCatalog(deps: CatalogDeps) {
	const mapLocal = (local: LocalCatalogHit[]): CatalogSearchResult[] =>
		local.map((hit) => ({
			torrentId: hit.torrentId,
			title: hit.title,
			category: hit.category,
			forumId: hit.forumId,
			authorId: hit.authorId,
			size: hit.size,
			seeds: hit.seeds,
			leeches: hit.leeches,
			downloads: hit.downloads,
			date: hit.date,
			torrentFileUrl: hit.torrentFileUrl,
			topicUrl: hit.topicUrl,
			hdr: hit.hdr,
			resolution: hit.resolution,
			imageUrl: hit.imageKey ? deps.publicUrl(hit.imageKey) : null,
		}));

	const search = async (query: string): Promise<CatalogSearchResponse> => {
		const local = await deps.searchLocal(deps.normalizeTitle(query));
		return {
			results: mapLocal(local),
			totalResults: local.length,
		};
	};

	/** Local hits of trackers that have not answered yet, minus fresh results. */
	const pendingLocalHits = async (
		query: string,
		pending: TrackerSource[],
		fresh: SearchResult[],
	): Promise<CatalogSearchResult[]> => {
		if (pending.length === 0) {
			return [];
		}
		const sources = new Set(pending);
		const freshIds = new Set(fresh.map((r) => r.torrentId));
		const local = await deps.searchLocal(deps.normalizeTitle(query));
		return mapLocal(
			local.filter(
				(hit) =>
					!freshIds.has(hit.torrentId) &&
					sources.has(parseTorrentId(hit.torrentId).source),
			),
		);
	};

	const searchRefresh = async (
		query: string,
		options: Partial<SearchOptions>,
		control?: TrackerSearchControl,
	): Promise<CatalogRefreshResponse> => {
		const outcome = await deps.searchTracker(query, options, control);
		if (outcome.status === "unavailable") {
			throw new Error("Tracker unavailable");
		}
		if (outcome.status === "error") {
			throw new TrackerSearchError(outcome.error, outcome.failures);
		}

		await deps.upsertFromTracker(outcome.results);

		const ids = outcome.results.map((r) => r.torrentId);
		const imageKeyById = await deps.loadImageKeys(ids);

		const pending = outcome.pending ?? [];
		const results: CatalogSearchResult[] = [
			...outcome.results.map((r) => {
				const key = imageKeyById.get(r.torrentId) ?? null;
				return {
					...r,
					imageUrl: key ? deps.publicUrl(key) : null,
				};
			}),
			...(await pendingLocalHits(query, pending, outcome.results)),
		].sort(compareTorrentQuality);

		const missingCoverIds = ids.filter((id) => !imageKeyById.get(id));
		deps.enqueueCoverFetch(missingCoverIds);

		return {
			results,
			totalResults: outcome.totalResults,
			trackerFailures: outcome.failures,
			pendingSources: pending,
		};
	};

	return {
		search,

		listRecent: async (limit: number): Promise<CatalogSearchResponse> => {
			const recent = await deps.listRecent(limit);
			return {
				results: mapLocal(recent),
				totalResults: recent.length,
			};
		},

		searchRefresh,

		/**
		 * Refresh from trackers; when every tracker fails, serve cached local hits
		 * and report why instead of failing the whole search.
		 */
		searchRefreshOrLocal: async (
			query: string,
			options: Partial<SearchOptions>,
			control?: TrackerSearchControl,
		): Promise<CatalogRefreshResponse> => {
			try {
				return await searchRefresh(query, options, control);
			} catch (error) {
				if (!(error instanceof TrackerSearchError)) {
					throw error;
				}
				const local = await search(query);
				return {
					...local,
					trackerFailures: error.failures,
					pendingSources: [],
				};
			}
		},
	};
}

export type Catalog = ReturnType<typeof createCatalog>;
