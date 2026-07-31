import type {
	SearchOptions,
	SearchResult,
} from "@brotracker/rutracker-ts/tracker/tracker-interface";
import { inArray } from "drizzle-orm";
import { db } from "../db/db";
import { torrents } from "../db/torrent/torrent.schema";
import { publicUrl } from "../storage/s3";
import { logger } from "../utils/logger";
import { enqueueCoverFetch } from "./cover.queue";
import { normalizeTitle } from "./title-norm";
import { searchLocal, upsertFromTracker } from "./torrent.repository";
import { tracker } from "./torrent.tracker";

export type TorrentSearchResult = SearchResult & {
	imageUrl: string | null;
};

export type TorrentSearchResponse = {
	source: "local" | "tracker";
	results: TorrentSearchResult[];
	totalResults: number | null;
};

export const torrentService = {
	search: async (
		query: string,
		options: Partial<SearchOptions>,
		{ force = false }: { force?: boolean } = {},
	): Promise<TorrentSearchResponse> => {
		if (!force) {
			const local = await searchLocal(normalizeTitle(query));
			if (local.length > 0) {
				return {
					source: "local",
					results: local,
					totalResults: local.length,
				};
			}
		}

		const page = await tracker.search(query, options);
		if (page.isErr()) {
			logger.error(
				{ err: page.error.message, query },
				"torrent search: tracker failed",
			);
			return { source: "tracker", results: [], totalResults: null };
		}

		await upsertFromTracker(page.value.results);

		const ids = page.value.results.map((r) => r.torrentId);
		const imageKeyById = await loadImageKeys(ids);

		const results: TorrentSearchResult[] = page.value.results.map((r) => {
			const key = imageKeyById.get(r.torrentId) ?? null;
			return {
				...r,
				imageUrl: key ? publicUrl(key) : null,
			};
		});

		const missingCoverIds = ids.filter((id) => !imageKeyById.get(id));
		void enqueueCoverFetch(missingCoverIds);

		return {
			source: "tracker",
			results,
			totalResults: page.value.totalResults,
		};
	},
};

async function loadImageKeys(
	torrentIds: string[],
): Promise<Map<string, string | null>> {
	const map = new Map<string, string | null>();
	if (torrentIds.length === 0) {
		return map;
	}

	const rows = await db
		.select({
			torrentId: torrents.torrentId,
			imageKey: torrents.imageKey,
		})
		.from(torrents)
		.where(inArray(torrents.torrentId, torrentIds));

	for (const row of rows) {
		map.set(row.torrentId, row.imageKey);
	}
	return map;
}
