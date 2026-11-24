import {
	isAllowedTrackerTorrentUrl,
	TorrentFilePreconditionError,
} from "../torrent/torrent-file";

export {
	isAllowedRutrackerTorrentUrl,
	isAllowedTrackerTorrentUrl,
} from "../torrent/torrent-file";

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
			if (error instanceof TorrentFilePreconditionError) {
				throw new AddFromTrackerPreconditionError(error.message);
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
