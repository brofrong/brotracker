import { loadQbittorrentConfig } from "../settings/qbittorrent-config";
import { extractTopicId } from "../title/topic-tag";
import {
	getTracker,
	getTrackerForTorrentId,
	TrackerNotConfiguredError,
} from "../torrent/torrent.tracker";
import {
	AddFromTrackerGatewayError,
	AddFromTrackerPreconditionError,
	createAddFromTracker,
} from "./add-from-tracker";
import { addTorrent } from "./qbittorent.client";

export {
	AddFromTrackerGatewayError,
	AddFromTrackerPreconditionError,
	isAllowedRutrackerTorrentUrl,
	isAllowedTrackerTorrentUrl,
} from "./add-from-tracker";

async function fetchTorrentFile(torrentFileUrl: string): Promise<Uint8Array> {
	const topicId = extractTopicId(torrentFileUrl);
	let tracker;
	try {
		tracker = topicId
			? await getTrackerForTorrentId(topicId)
			: await getTracker();
	} catch (error) {
		throw new AddFromTrackerPreconditionError(
			error instanceof Error ? error.message : String(error),
		);
	}

	const file = await tracker.getTorrent(torrentFileUrl);
	if (file.isErr()) {
		throw new AddFromTrackerGatewayError(file.error.message);
	}
	return file.value;
}

export const addFromTracker = createAddFromTracker({
	loadConfig: loadQbittorrentConfig,
	fetchTorrentFile,
	addTorrent: (bytes, options) => addTorrent(bytes, options),
});

export { TrackerNotConfiguredError };
