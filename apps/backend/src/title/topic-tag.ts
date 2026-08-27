import {
	formatTorrentId,
	parseTorrentId,
	type TrackerSource,
} from "@brotracker/rutracker-ts/tracker/torrent-id";
import { KINOZAL_URL, KINOZAL_DL_URL } from "@brotracker/rutracker-ts/tracker/search-engine/kinozal/constants";
import {
	isKinozalDlHostname,
	isKinozalSiteHostname,
} from "@brotracker/rutracker-ts/tracker/search-engine/kinozal/hosts";
import { RUTRACKER_URL } from "@brotracker/rutracker-ts/tracker/search-engine/rutracker/constants";

export const TOPIC_TAG_PREFIX = "brotracker:topic:";

export function topicTag(topicId: string): string {
	return `${TOPIC_TAG_PREFIX}${topicId}`;
}

function legacyRutrackerId(topicId: string): string | null {
	try {
		const parsed = parseTorrentId(topicId);
		if (parsed.source === "rutracker") {
			return parsed.rawId;
		}
	} catch {
		if (/^\d+$/.test(topicId)) {
			return topicId;
		}
	}
	return null;
}

export function topicUrlFromId(topicId: string): string {
	const { source, rawId } = parseTorrentId(topicId);
	if (source === "kinozal") {
		return `${KINOZAL_URL}/details.php?id=${rawId}`;
	}
	return `${RUTRACKER_URL}/forum/viewtopic.php?t=${rawId}`;
}

export function torrentFileUrlFromId(topicId: string): string {
	const { source, rawId } = parseTorrentId(topicId);
	if (source === "kinozal") {
		return `${KINOZAL_DL_URL}/download.php?id=${rawId}`;
	}
	return `${RUTRACKER_URL}/forum/dl.php?t=${rawId}`;
}

function extractKinozalTopicId(url: URL): string | null {
	if (
		url.pathname === "/download.php" &&
		isKinozalDlHostname(url.hostname)
	) {
		const id = url.searchParams.get("id");
		if (id && /^\d+$/.test(id)) {
			return formatTorrentId("kinozal", id);
		}
		return null;
	}

	if (
		url.pathname === "/details.php" &&
		isKinozalSiteHostname(url.hostname)
	) {
		const id = url.searchParams.get("id");
		if (id && /^\d+$/.test(id)) {
			return formatTorrentId("kinozal", id);
		}
	}
	return null;
}

function extractRutrackerTopicId(url: URL): string | null {
	const rutrackerHost = new URL(RUTRACKER_URL).hostname;
	if (url.hostname !== rutrackerHost) {
		return null;
	}
	if (url.pathname !== "/forum/viewtopic.php" && url.pathname !== "/forum/dl.php") {
		return null;
	}
	const topicId = url.searchParams.get("t");
	if (!topicId || !/^\d+$/.test(topicId)) {
		return null;
	}
	return formatTorrentId("rutracker", topicId);
}

export function extractTopicId(url: string): string | null {
	try {
		const parsed = new URL(url);
		return extractKinozalTopicId(parsed) ?? extractRutrackerTopicId(parsed);
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
		const suffix = tag.slice(TOPIC_TAG_PREFIX.length);
		if (/^\d+$/.test(suffix)) {
			return formatTorrentId("rutracker", suffix);
		}
		try {
			parseTorrentId(suffix);
			return suffix;
		} catch {
			continue;
		}
	}
	return null;
}

function topicTagsForMatch(topicId: string): string[] {
	const tags = [topicTag(topicId)];
	const legacyDigits = legacyRutrackerId(topicId);
	if (legacyDigits) {
		tags.push(topicTag(legacyDigits));
	}
	return tags;
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
	const matchTags = new Set(topicTagsForMatch(topicId));
	for (const torrent of torrents) {
		const tags = torrent.tags
			.split(",")
			.map((part) => part.trim())
			.filter(Boolean);
		if (tags.some((tag) => matchTags.has(tag))) {
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

export function trackerSourceFromTopicId(topicId: string): TrackerSource {
	return parseTorrentId(topicId).source;
}
