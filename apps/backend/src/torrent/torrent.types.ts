import type { SearchResult } from "@brotracker/rutracker-ts/tracker/tracker-interface";

/** Cached tracker hit as stored / returned by the torrent repository. */
export type LocalCatalogHit = SearchResult & {
	imageKey: string | null;
};
