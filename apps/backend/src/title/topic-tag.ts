import { RUTRACKER_URL } from "@brotracker/rutracker-ts/tracker/search-engine/rutracker/constants";

export const TOPIC_TAG_PREFIX = "brotracker:topic:";

export function topicTag(topicId: string): string {
	return `${TOPIC_TAG_PREFIX}${topicId}`;
}

export function topicUrlFromId(topicId: string): string {
	return `${RUTRACKER_URL}/forum/viewtopic.php?t=${topicId}`;
}

export function torrentFileUrlFromId(topicId: string): string {
	return `${RUTRACKER_URL}/forum/dl.php?t=${topicId}`;
}

export function extractTopicId(url: string): string | null {
	try {
		const parsed = new URL(url);
		const topicId = parsed.searchParams.get("t");
		if (!topicId || !/^\d+$/.test(topicId)) {
			return null;
		}
		return topicId;
	} catch {
		return null;
	}
}

export function extractTopicIdFromTags(tags: string): string | null {
	for (const part of tags.split(",")) {
		const tag = part.trim();
		if (!tag.startsWith(TOPIC_TAG_PREFIX)) {
			continue;
		}
		const topicId = tag.slice(TOPIC_TAG_PREFIX.length);
		if (/^\d+$/.test(topicId)) {
			return topicId;
		}
	}
	return null;
}

export type TaggedLiveTorrent = {
	hash: string;
	progress: number;
	stateKind: string;
	stateLabel: string;
	downloadSpeed: number;
	etaSeconds: number;
	tags: string;
};

export type TopicTransfer = {
	hash: string;
	progress: number;
	stateKind: string;
	stateLabel: string;
	downloadSpeed: number;
	etaSeconds: number;
};

export function findTransferForTopic(
	topicId: string,
	torrents: TaggedLiveTorrent[],
): TopicTransfer | null {
	const tag = topicTag(topicId);
	for (const torrent of torrents) {
		const tags = torrent.tags
			.split(",")
			.map((part) => part.trim())
			.filter(Boolean);
		if (tags.includes(tag)) {
			return {
				hash: torrent.hash,
				progress: torrent.progress,
				stateKind: torrent.stateKind,
				stateLabel: torrent.stateLabel,
				downloadSpeed: torrent.downloadSpeed,
				etaSeconds: torrent.etaSeconds,
			};
		}
	}
	return null;
}
