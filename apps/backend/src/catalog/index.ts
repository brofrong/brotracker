import { inArray } from "drizzle-orm";
import { db } from "../db/db";
import { torrents } from "../db/torrent/torrent.schema";
import { publicUrl } from "../storage/s3";
import { logger } from "../utils/logger";
import { enqueueCoverFetch } from "../torrent/cover.queue";
import { normalizeTitle } from "../torrent/title-norm";
import { searchLocal, upsertFromTracker } from "../torrent/torrent.repository";
import { getTracker } from "../torrent/torrent.tracker";
import { createCatalog } from "./catalog";

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

export const catalog = createCatalog({
	normalizeTitle,
	searchLocal,
	upsertFromTracker,
	loadImageKeys,
	publicUrl,
	enqueueCoverFetch: (ids) => {
		void enqueueCoverFetch(ids);
	},
	searchTracker: async (query, options) => {
		let tracker;
		try {
			tracker = await getTracker();
		} catch (err) {
			logger.error(
				{ err: err instanceof Error ? err.message : String(err), query },
				"torrent search: tracker not available",
			);
			return { status: "unavailable" };
		}

		const page = await tracker.search(query, options);
		if (page.isErr()) {
			logger.error(
				{ err: page.error.message, query },
				"torrent search: tracker failed",
			);
			return { status: "error", error: page.error };
		}

		return {
			status: "ok",
			results: page.value.results,
			totalResults: page.value.totalResults,
		};
	},
});

export type { CatalogSearchResponse, CatalogSearchResult } from "./catalog";
