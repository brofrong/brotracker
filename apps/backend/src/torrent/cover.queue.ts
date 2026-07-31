import { eq } from "drizzle-orm";
import { db } from "../db/db";
import { torrents } from "../db/torrent/torrent.schema";
import { putCover } from "../storage/s3";
import { logger } from "../utils/logger";
import { tracker } from "./torrent.tracker";

const CONCURRENCY = 3;
const FETCH_TIMEOUT_MS = 15_000;

const inFlight = new Set<string>();
const pending: string[] = [];
let active = 0;

/** Fire-and-forget: enqueue cover fetches; returns immediately. Dedupes in-flight ids. */
export function enqueueCoverFetch(torrentIds: string[]): void {
	for (const id of torrentIds) {
		if (!id || inFlight.has(id)) {
			continue;
		}
		inFlight.add(id);
		pending.push(id);
	}
	pump();
}

function pump(): void {
	while (active < CONCURRENCY && pending.length > 0) {
		const id = pending.shift();
		if (!id) {
			break;
		}
		active += 1;
		void processOne(id).finally(() => {
			inFlight.delete(id);
			active -= 1;
			pump();
		});
	}
}

async function processOne(torrentId: string): Promise<void> {
	try {
		const rows = await db
			.select({ imageKey: torrents.imageKey })
			.from(torrents)
			.where(eq(torrents.torrentId, torrentId))
			.limit(1);

		const row = rows[0];
		if (!row) {
			logger.warn({ torrentId }, "cover fetch: torrent row missing");
			return;
		}
		if (row.imageKey) {
			return;
		}

		const imageResult = await tracker.getImage(torrentId);
		if (imageResult.isErr()) {
			logger.warn(
				{ torrentId, err: imageResult.error.message },
				"cover fetch: getImage failed",
			);
			return;
		}

		const remoteUrl = imageResult.value.trim();
		if (!remoteUrl) {
			return;
		}

		const bytesResult = await fetchCoverBytes(remoteUrl);
		if (!bytesResult) {
			return;
		}

		const key = await putCover(
			torrentId,
			bytesResult.bytes,
			bytesResult.contentType,
		);

		await db
			.update(torrents)
			.set({ imageKey: key })
			.where(eq(torrents.torrentId, torrentId));
	} catch (err) {
		logger.error(
			{ torrentId, err: err instanceof Error ? err.message : String(err) },
			"cover fetch: unexpected failure",
		);
	}
}

async function fetchCoverBytes(
	url: string,
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
	try {
		const response = await fetch(url, {
			redirect: "follow",
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
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
		const bytes = new Uint8Array(await response.arrayBuffer());
		if (bytes.byteLength === 0) {
			logger.warn({ url }, "cover fetch: empty image body");
			return null;
		}
		return { bytes, contentType };
	} catch (err) {
		logger.warn(
			{ url, err: err instanceof Error ? err.message : String(err) },
			"cover fetch: download failed",
		);
		return null;
	}
}
