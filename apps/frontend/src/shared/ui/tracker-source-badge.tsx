"use client";

import { Badge } from "@astryxdesign/core/Badge";
import {
	parseTorrentId,
	type TrackerSource,
} from "@brotracker/rutracker-ts/tracker/torrent-id";
import { useTranslation } from "react-i18next";

function sourceVariant(source: TrackerSource): "teal" | "green" {
	return source === "kinozal" ? "green" : "teal";
}

export function TrackerSourceBadge({ torrentId }: { torrentId: string }) {
	const { t } = useTranslation("common");

	try {
		const { source } = parseTorrentId(torrentId);
		return (
			<Badge
				label={t(`trackerSource.${source}`)}
				variant={sourceVariant(source)}
			/>
		);
	} catch {
		return null;
	}
}
