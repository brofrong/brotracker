import { KINOZAL_DL_URL } from "@brotracker/rutracker-ts/tracker/search-engine/kinozal/constants";
import { RUTRACKER_URL } from "@brotracker/rutracker-ts/tracker/search-engine/rutracker/constants";

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

function isAllowedKinozalTorrentUrl(torrentFileUrl: string): boolean {
	try {
		const url = new URL(torrentFileUrl);
		const base = new URL(KINOZAL_DL_URL);
		if (url.protocol !== "https:") return false;
		if (url.hostname !== base.hostname) return false;
		if (url.pathname !== "/download.php") return false;
		const topicId = url.searchParams.get("id");
		return Boolean(topicId && /^\d+$/.test(topicId));
	} catch {
		return false;
	}
}

/** Allow RuTracker and Kinozal torrent download endpoints only. */
export function isAllowedTrackerTorrentUrl(torrentFileUrl: string): boolean {
	return (
		isAllowedRutrackerTorrentUrl(torrentFileUrl) ||
		isAllowedKinozalTorrentUrl(torrentFileUrl)
	);
}

export type AddFromTrackerDeps = {
	loadConfig: () => Promise<{
		filmsPath: string;
		seriesPath: string;
	} | null>;
	fetchTorrentFile: (torrentFileUrl: string) => Promise<Uint8Array>;
	addTorrent: (
		bytes: Uint8Array,
		options: { pathToSave: string; tags?: string[] },
	) => Promise<void>;
};

export function createAddFromTracker(deps: AddFromTrackerDeps) {
	return async function addFromTracker(
		torrentFileUrl: string,
		mediaType: "films" | "tv",
		tags: string[] = [],
	): Promise<void> {
		if (!isAllowedTrackerTorrentUrl(torrentFileUrl)) {
			throw new AddFromTrackerPreconditionError(
				"Некорректный URL торрент-файла",
			);
		}

		const config = await deps.loadConfig();
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

		let bytes: Uint8Array;
		try {
			bytes = await deps.fetchTorrentFile(torrentFileUrl);
		} catch (error) {
			if (
				error instanceof AddFromTrackerPreconditionError ||
				error instanceof AddFromTrackerGatewayError
			) {
				throw error;
			}
			throw new AddFromTrackerGatewayError(
				error instanceof Error ? error.message : String(error),
			);
		}

		try {
			await deps.addTorrent(bytes, {
				pathToSave,
				tags: tags.length > 0 ? tags : undefined,
			});
		} catch (error) {
			throw new AddFromTrackerGatewayError(
				error instanceof Error ? error.message : String(error),
			);
		}
	};
}
