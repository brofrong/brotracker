import type { SearchResult } from "@brotracker/rutracker-ts/tracker/tracker-interface";
import { inArray } from "drizzle-orm";
import { db } from "../db/db";
import { torrents } from "../db/torrent/torrent.schema";
import { publicUrl } from "../storage/s3";
import { enqueueCoverFetch } from "../torrent/cover.queue";
import { normalizeTitle } from "../torrent/title-norm";
import {
	listRecent,
	searchLocal,
	upsertFromTracker,
} from "../torrent/torrent.repository";
import { getTracker, listEnabledTrackers } from "../torrent/torrent.tracker";
import {
	classifyTrackerError,
	errorMessage,
	type TrackerFailure,
} from "../torrent/tracker-error";
import { logger } from "../utils/logger";
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

		const attempts = await Promise.all(
			sources.map(async (source) => {
				try {
					const tracker = await getTracker(source);
					const page = await tracker.search(query, options);
					if (page.isErr()) {
						throw page.error;
					}
					return { source, ok: true as const, page: page.value };
				} catch (reason) {
					return { source, ok: false as const, reason };
				}
			}),
		);

		const results: SearchResult[] = [];
		const failures: TrackerFailure[] = [];
		let firstError: Error | null = null;
		let totalResults: number | null = 0;
		let allTotalsNumeric = true;

		for (const attempt of attempts) {
			if (attempt.ok) {
				results.push(...attempt.page.results);
				const total = attempt.page.totalResults;
				if (total == null) {
					allTotalsNumeric = false;
				} else if (allTotalsNumeric) {
					totalResults = (totalResults ?? 0) + total;
				}
				continue;
			}

			const { source, reason } = attempt;
			const message = errorMessage(reason);
			const code = classifyTrackerError(message);
			failures.push({ source, code, message });
			firstError ??= reason instanceof Error ? reason : new Error(message);
			logger.error(
				{ source, code, err: message, query },
				"torrent search: tracker failed",
			);
		}

		if (firstError && failures.length === attempts.length) {
			return { status: "error", error: firstError, failures };
		}

		return {
			status: "ok",
			results,
			totalResults: allTotalsNumeric ? totalResults : null,
			failures,
		};
	},
});

export type {
	CatalogRefreshResponse,
	CatalogSearchResponse,
	CatalogSearchResult,
} from "./catalog";
