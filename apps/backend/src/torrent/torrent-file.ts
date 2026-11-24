import { isKinozalDownloadUrl } from "@brotracker/rutracker-ts/tracker/search-engine/kinozal/hosts";
import { isRutorDownloadUrl } from "@brotracker/rutracker-ts/tracker/search-engine/rutor/hosts";
import { RUTRACKER_URL } from "@brotracker/rutracker-ts/tracker/search-engine/rutracker/constants";
import type { TrackerInterface } from "@brotracker/rutracker-ts/tracker/tracker-interface";

/** Bad URL or the tracker is not configured: the caller can fix it. */
export class TorrentFilePreconditionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "TorrentFilePreconditionError";
	}
}

/** The tracker failed to return the file. */
export class TorrentFileGatewayError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "TorrentFileGatewayError";
	}
}

/** Only allow RuTracker torrent download endpoints (blocks SSRF / cookie exfil). */
export function isAllowedRutrackerTorrentUrl(torrentFileUrl: string): boolean {
	try {
		const url = new URL(torrentFileUrl);
		const base = new URL(RUTRACKER_URL);
		if (url.protocol !== "https:") return false;
		if (url.hostname !== base.hostname) return false;
		if (url.pathname !== "/forum/dl.php") return false;
		const topicId = url.searchParams.get("t");
		return Boolean(topicId && /^\d+$/.test(topicId));
	} catch {
		return false;
	}
}

/** Allow RuTracker, Kinozal and RuTor torrent download endpoints only. */
export function isAllowedTrackerTorrentUrl(torrentFileUrl: string): boolean {
	return (
		isAllowedRutrackerTorrentUrl(torrentFileUrl) ||
		isKinozalDownloadUrl(torrentFileUrl) ||
		isRutorDownloadUrl(torrentFileUrl)
	);
}

export type TorrentFileDeps = {
	/** Tracker client that owns this download URL (logged in, Cloudflare-cleared). */
	trackerForUrl: (torrentFileUrl: string) => Promise<TrackerInterface>;
};

/**
 * Fetch a `.torrent` file from an allowed tracker URL, through the tracker
 * client so the session cookies and Cloudflare clearance apply.
 */
export function createTorrentFileFetcher(deps: TorrentFileDeps) {
	return async function fetchTorrentFile(
		torrentFileUrl: string,
	): Promise<Uint8Array> {
		if (!isAllowedTrackerTorrentUrl(torrentFileUrl)) {
			throw new TorrentFilePreconditionError("Некорректный URL торрент-файла");
		}

		let tracker: TrackerInterface;
		try {
			tracker = await deps.trackerForUrl(torrentFileUrl);
		} catch (error) {
			throw new TorrentFilePreconditionError(
				error instanceof Error ? error.message : String(error),
			);
		}

		let file: Awaited<ReturnType<TrackerInterface["getTorrent"]>>;
		try {
			file = await tracker.getTorrent(torrentFileUrl);
		} catch (error) {
			throw new TorrentFileGatewayError(
				error instanceof Error ? error.message : String(error),
			);
		}
		if (file.isErr()) {
			throw new TorrentFileGatewayError(file.error.message);
		}
		return file.value;
	};
}
