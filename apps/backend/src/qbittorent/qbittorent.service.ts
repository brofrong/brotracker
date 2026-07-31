import { RUTRACKER_URL } from "@brotracker/rutracker-ts/tracker/search-engine/rutracker/constants";
import { loadQbittorrentConfig } from "../settings/qbittorrent-config";
import { getTracker } from "../torrent/torrent.tracker";
import {
	addTorrent,
	getFreeSpaceOnDisk,
	getTorrents,
} from "./qbittorent.client";
import type { AddTorrentOptions } from "./qbittorent.types";

export class AddFromTrackerPreconditionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "AddFromTrackerPreconditionError";
	}
}

export class AddFromTrackerGatewayError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "AddFromTrackerGatewayError";
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

export const qbittorentService = {
	getTorrents,
	getFreeSpaceOnDisk,
	addTorrent: (
		torrentFileOrMagnetLinkOrBytes: string | Uint8Array,
		options: AddTorrentOptions,
	) => addTorrent(torrentFileOrMagnetLinkOrBytes, options),

	async addFromTracker(
		torrentFileUrl: string,
		mediaType: "films" | "tv",
	): Promise<void> {
		if (!isAllowedRutrackerTorrentUrl(torrentFileUrl)) {
			throw new AddFromTrackerPreconditionError(
				"Некорректный URL торрент-файла",
			);
		}

		const config = await loadQbittorrentConfig();
		if (!config) {
			throw new AddFromTrackerPreconditionError(
				"qBittorrent is not configured. Set URL and API key in Settings.",
			);
		}

		const pathToSave =
			mediaType === "films" ? config.filmsPath : config.seriesPath;
		if (!pathToSave) {
			throw new AddFromTrackerPreconditionError(
				mediaType === "films"
					? "Путь для фильмов не задан в настройках"
					: "Путь для сериалов не задан в настройках",
			);
		}

		let tracker;
		try {
			tracker = await getTracker();
		} catch (error) {
			throw new AddFromTrackerPreconditionError(
				error instanceof Error ? error.message : String(error),
			);
		}

		const file = await tracker.getTorrent(torrentFileUrl);
		if (file.isErr()) {
			throw new AddFromTrackerGatewayError(file.error.message);
		}

		try {
			await addTorrent(file.value, { pathToSave });
		} catch (error) {
			throw new AddFromTrackerGatewayError(
				error instanceof Error ? error.message : String(error),
			);
		}
	},
};
