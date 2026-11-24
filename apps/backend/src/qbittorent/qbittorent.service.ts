import { loadQbittorrentConfig } from "../settings/qbittorrent-config";
import { fetchTorrentFile } from "../torrent/torrent-file.live";
import { TrackerNotConfiguredError } from "../torrent/torrent.tracker";
import { createAddFromTracker } from "./add-from-tracker";
import { addTorrent } from "./qbittorent.client";

export {
	AddFromTrackerGatewayError,
	AddFromTrackerPreconditionError,
	isAllowedRutrackerTorrentUrl,
	isAllowedTrackerTorrentUrl,
} from "./add-from-tracker";

export const addFromTracker = createAddFromTracker({
	loadConfig: loadQbittorrentConfig,
	fetchTorrentFile,
	addTorrent: (bytes, options) => addTorrent(bytes, options),
});

export { TrackerNotConfiguredError };
