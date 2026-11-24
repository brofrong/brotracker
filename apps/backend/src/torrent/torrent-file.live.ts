import { extractTopicId } from "../title/topic-tag";
import { createTorrentFileFetcher } from "./torrent-file";
import { getTracker, getTrackerForTorrentId } from "./torrent.tracker";

export const fetchTorrentFile = createTorrentFileFetcher({
	trackerForUrl: (torrentFileUrl) => {
		const topicId = extractTopicId(torrentFileUrl);
		return topicId ? getTrackerForTorrentId(topicId) : getTracker();
	},
});
