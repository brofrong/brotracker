import type { TrackerSource } from "@brotracker/rutracker-ts/tracker/torrent-id";

import { logger } from "../utils/logger";
import { getTracker, listEnabledTrackers } from "./torrent.tracker";
import { errorMessage } from "./tracker-error";

/**
 * Cloudflare drops cf_clearance and trackers drop sessions long before the
 * cookies' stated expiry; refreshing them in the background keeps the 5-10s
 * Byparr solve and the login out of user searches.
 */
const WARMUP_INTERVAL_MS = 15 * 60_000;

const WARMUP_QUERY = "test";

/**
 * Run a real search so the tracker client solves Cloudflare / logs in again
 * when it has to. Never throws.
 */
export async function warmUpTracker(source: TrackerSource): Promise<boolean> {
	const startedAt = Date.now();
	try {
		const tracker = await getTracker(source);
		const result = await tracker._getHTML(WARMUP_QUERY, {});
		if (result.isErr()) {
			throw result.error;
		}
		logger.info(
			{ source, latencyMs: Date.now() - startedAt },
			"tracker warm-up done",
		);
		return true;
	} catch (error) {
		logger.warn(
			{ source, err: errorMessage(error), latencyMs: Date.now() - startedAt },
			"tracker warm-up failed",
		);
		return false;
	}
}

export async function warmUpTrackers(): Promise<void> {
	try {
		const sources = await listEnabledTrackers();
		await Promise.all(sources.map(warmUpTracker));
	} catch (error) {
		logger.warn({ err: errorMessage(error) }, "tracker warm-up failed");
	}
}

/** Warm up on start, then on an interval. Returns a stop function. */
export function startTrackerWarmup(
	intervalMs: number = WARMUP_INTERVAL_MS,
): () => void {
	void warmUpTrackers();
	const interval = setInterval(() => {
		void warmUpTrackers();
	}, intervalMs);
	return () => clearInterval(interval);
}
