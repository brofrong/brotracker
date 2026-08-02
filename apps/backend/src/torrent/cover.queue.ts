import { eq } from "drizzle-orm";
import { db } from "../db/db";
import { torrents } from "../db/torrent/torrent.schema";
import { optimizeCover } from "../storage/cover-image";
import { putCover } from "../storage/s3";
import { logger } from "../utils/logger";
import {
	createCoverFetchQueue,
	type CoverPipelineDeps,
} from "./cover-pipeline";
import { getTracker } from "./torrent.tracker";

const FETCH_TIMEOUT_MS = 15_000;

const COVER_FETCH_HEADERS = {
	// Image hosts (e.g. fastpic) often 404 hotlinks without a forum Referer.
	Referer: "https://rutracker.org/",
	"User-Agent":
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
} as const;

async function fetchCoverBytes(url: string): Promise<Uint8Array | null> {
	try {
		const response = await fetch(url, {
			redirect: "follow",
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
			headers: COVER_FETCH_HEADERS,
		});
		if (!response.ok) {
			logger.warn(
				{ url, status: response.status },
				"cover fetch: HTTP error downloading image",
			);
			return null;
		}
		const contentType =
			response.headers.get("content-type")?.split(";")[0]?.trim() ||
			"image/jpeg";
		if (!contentType.startsWith("image/")) {
			logger.warn(
				{ url, contentType },
				"cover fetch: response is not an image",
			);
			return null;
		}
		const bytes = new Uint8Array(await response.arrayBuffer());
		if (bytes.byteLength === 0) {
			logger.warn({ url }, "cover fetch: empty image body");
			return null;
		}
		return bytes;
	} catch (err) {
		logger.warn(
			{ url, err: err instanceof Error ? err.message : String(err) },
			"cover fetch: download failed",
		);
		return null;
	}
}

export const liveCoverPipelineDeps: CoverPipelineDeps = {
	getImageKey: async (torrentId) => {
		const rows = await db
			.select({ imageKey: torrents.imageKey })
			.from(torrents)
			.where(eq(torrents.torrentId, torrentId))
			.limit(1);
		const row = rows[0];
		if (!row) {
			return undefined;
		}
		return row.imageKey;
	},
	resolveImageUrl: async (torrentId) => {
		const tracker = await getTracker();
		const imageResult = await tracker.getImage(torrentId);
		if (imageResult.isErr()) {
			logger.warn(
				{ torrentId, err: imageResult.error.message },
				"cover fetch: getImage failed",
			);
			return null;
		}
		const remoteUrl = imageResult.value.trim();
		return remoteUrl || null;
	},
	downloadBytes: fetchCoverBytes,
	optimize: optimizeCover,
	putCover,
	persistImageKey: async (torrentId, key) => {
		await db
			.update(torrents)
			.set({ imageKey: key })
			.where(eq(torrents.torrentId, torrentId));
	},
	onWarn: (message, context) => {
		logger.warn(context, message);
	},
	onError: (message, context) => {
		logger.error(context, message);
	},
};

const liveQueue = createCoverFetchQueue(liveCoverPipelineDeps);

/** Fire-and-forget: enqueue cover fetches; returns immediately. Dedupes in-flight ids. */
export function enqueueCoverFetch(torrentIds: string[]): void {
	liveQueue.enqueue(torrentIds);
}
