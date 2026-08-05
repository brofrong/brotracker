import type { SearchResult } from "@brotracker/rutracker-ts/tracker/tracker-interface";
import { inArray } from "drizzle-orm";
import { db } from "../db/db";
import { torrents } from "../db/torrent/torrent.schema";
import { publicUrl } from "../storage/s3";
import { logger } from "../utils/logger";
import { enqueueCoverFetch } from "../torrent/cover.queue";
import { normalizeTitle } from "../torrent/title-norm";
import { searchLocal, listRecent, upsertFromTracker } from "../torrent/torrent.repository";
import { getTracker, listEnabledTrackers } from "../torrent/torrent.tracker";
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
	listRecent,
	upsertFromTracker,
	loadImageKeys,
	publicUrl,
	enqueueCoverFetch: (ids) => {
		void enqueueCoverFetch(ids);
	},
	searchTracker: async (query, options) => {
		const sources = await listEnabledTrackers();
		if (sources.length === 0) {
			logger.error({ query }, "torrent search: no enabled trackers");
			return { status: "unavailable" };
		}

		const settled = await Promise.allSettled(
			sources.map(async (source) => {
				const tracker = await getTracker(source);
				const page = await tracker.search(query, options);
				if (page.isErr()) {
					throw page.error;
				}
				return page.value;
			}),
		);

		const results: SearchResult[] = [];
		let totalResults: number | null = 0;
		let allTotalsNumeric = true;
		let successCount = 0;

		for (let i = 0; i < settled.length; i++) {
			const outcome = settled[i];
			const source = sources[i];
			if (outcome.status === "fulfilled") {
				successCount += 1;
				results.push(...outcome.value.results);
				const total = outcome.value.totalResults;
				if (total == null) {
					allTotalsNumeric = false;
				} else if (allTotalsNumeric) {
					totalResults = (totalResults ?? 0) + total;
				}
				continue;
			}

			logger.error(
				{
					source,
					err:
						outcome.reason instanceof Error
							? outcome.reason.message
							: String(outcome.reason),
					query,
				},
				"torrent search: tracker failed",
			);
		}

		if (successCount === 0) {
			const firstError = settled.find((o) => o.status === "rejected");
			if (
				firstError?.status === "rejected" &&
				firstError.reason instanceof Error
			) {
				return { status: "error", error: firstError.reason };
			}
			return { status: "unavailable" };
		}

		return {
			status: "ok",
			results,
			totalResults: allTotalsNumeric ? totalResults : null,
		};
	},
});

export type { CatalogSearchResponse, CatalogSearchResult } from "./catalog";
