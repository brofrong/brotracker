import { detectMediaType as detectKinozal } from "./search-engine/kinozal/media-type";
import { detectMediaType as detectRutor } from "./search-engine/rutor/categories";
import { detectMediaType as detectRutracker } from "./search-engine/rutracker/media-type";
import { parseTorrentId, type TrackerSource } from "./torrent-id";

export type MediaType = "films" | "tv";

const detectors: Record<TrackerSource, (forumId: string) => MediaType | null> =
	{
		rutracker: detectRutracker,
		kinozal: detectKinozal,
		rutor: detectRutor,
	};

/** Films vs series from the tracker's own category id; null when unknown. */
export function detectTorrentMediaType(
	torrentId: string,
	forumId: string,
): MediaType | null {
	try {
		return detectors[parseTorrentId(torrentId).source](forumId);
	} catch {
		return null;
	}
}
