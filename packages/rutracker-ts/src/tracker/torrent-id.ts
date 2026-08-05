export const TRACKER_SOURCES = ["rutracker", "kinozal"] as const;

export type TrackerSource = (typeof TRACKER_SOURCES)[number];

export type ParsedTorrentId = {
	source: TrackerSource;
	rawId: string;
};

const SOURCE_SET = new Set<string>(TRACKER_SOURCES);

export function formatTorrentId(source: TrackerSource, rawId: string): string {
	const id = rawId.trim();
	if (!id) {
		throw new Error("rawId must be non-empty");
	}
	if (id.includes(":")) {
		throw new Error(`rawId must not contain ':': ${rawId}`);
	}
	return `${source}:${id}`;
}

/**
 * Parse a namespaced torrent id.
 * Bare digits are treated as legacy RuTracker ids.
 */
export function parseTorrentId(torrentId: string): ParsedTorrentId {
	const value = torrentId.trim();
	const colon = value.indexOf(":");
	if (colon <= 0) {
		if (!/^\d+$/.test(value)) {
			throw new Error(`Invalid torrent id: ${torrentId}`);
		}
		return { source: "rutracker", rawId: value };
	}

	const source = value.slice(0, colon);
	const rawId = value.slice(colon + 1);
	if (!SOURCE_SET.has(source) || !rawId) {
		throw new Error(`Invalid torrent id: ${torrentId}`);
	}
	return { source: source as TrackerSource, rawId };
}

export function isTrackerSource(value: string): value is TrackerSource {
	return SOURCE_SET.has(value);
}
