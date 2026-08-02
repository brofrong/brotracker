import type {
	SearchOptions,
	SearchResult,
} from "@brotracker/rutracker-ts/tracker/tracker-interface";

export type CatalogSearchResult = SearchResult & {
	imageUrl: string | null;
};

export type CatalogSearchResponse = {
	source: "local" | "tracker";
	results: CatalogSearchResult[];
	totalResults: number | null;
};

export type LocalCatalogHit = SearchResult & {
	imageKey: string | null;
};

export type TrackerSearchOutcome =
	| {
			status: "ok";
			results: SearchResult[];
			totalResults: number | null;
	  }
	| { status: "unavailable" }
	| { status: "error"; error: Error };

export type CatalogDeps = {
	normalizeTitle: (query: string) => string;
	searchLocal: (queryNorm: string) => Promise<LocalCatalogHit[]>;
	searchTracker: (
		query: string,
		options: Partial<SearchOptions>,
	) => Promise<TrackerSearchOutcome>;
	upsertFromTracker: (results: SearchResult[]) => Promise<void>;
	loadImageKeys: (
		torrentIds: string[],
	) => Promise<Map<string, string | null>>;
	publicUrl: (key: string) => string;
	enqueueCoverFetch: (torrentIds: string[]) => void;
};

export function createCatalog(deps: CatalogDeps) {
	return {
		search: async (
			query: string,
			options: Partial<SearchOptions>,
			{ source }: { source: "local" | "tracker" },
		): Promise<CatalogSearchResponse> => {
			if (source === "local") {
				const local = await deps.searchLocal(deps.normalizeTitle(query));
				return {
					source: "local",
					results: local.map((hit) => ({
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
					})),
					totalResults: local.length,
				};
			}

			const outcome = await deps.searchTracker(query, options);
			if (outcome.status !== "ok") {
				return { source: "tracker", results: [], totalResults: null };
			}

			await deps.upsertFromTracker(outcome.results);

			const ids = outcome.results.map((r) => r.torrentId);
			const imageKeyById = await deps.loadImageKeys(ids);

			const results: CatalogSearchResult[] = outcome.results.map((r) => {
				const key = imageKeyById.get(r.torrentId) ?? null;
				return {
					...r,
					imageUrl: key ? deps.publicUrl(key) : null,
				};
			});

			const missingCoverIds = ids.filter((id) => !imageKeyById.get(id));
			deps.enqueueCoverFetch(missingCoverIds);

			return {
				source: "tracker",
				results,
				totalResults: outcome.totalResults,
			};
		},
	};
}

export type Catalog = ReturnType<typeof createCatalog>;
