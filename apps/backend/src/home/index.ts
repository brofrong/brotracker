import {
	getTransferStats,
	QbittorrentNotConfiguredError,
} from "../qbittorent/qbittorent.client";
import { resolveTmdbCredentials } from "../settings/provider-settings";
import { listRecentWatchEvents } from "../title/title-watch-event.repository";
import { logger } from "../utils/logger";
import { createHome } from "./home";
import { createFetchDiscoverFeed } from "./tmdb-discover";
import {
	getRecentSpeeds,
	getTransferHistory,
	recordSpeedSample,
	recordTransferSnapshot,
} from "./transfer-history";

const TITLE_WATCH_FEED_LIMIT = 20;

export const home = createHome({
	getTransferStats: async () => {
		try {
			const stats = await getTransferStats();
			recordTransferSnapshot(stats).catch((err: unknown) => {
				logger.warn({ err }, "Failed to record transfer snapshot");
			});
			recordSpeedSample(stats).catch((err: unknown) => {
				logger.warn({ err }, "Failed to record speed sample");
			});
			return stats;
		} catch (error) {
			if (error instanceof QbittorrentNotConfiguredError) {
				return null;
			}
			throw error;
		}
	},
	getTransferHistory,
	getRecentSpeeds,
	getDiscoverFeed: createFetchDiscoverFeed(resolveTmdbCredentials),
	getTitleWatchEvents: () => listRecentWatchEvents(TITLE_WATCH_FEED_LIMIT),
});

export type {
	ComposeResponse,
	ComposeWidgetRequest,
	DiscoverCard,
	DiscoverFeed,
	Home,
	SpeedSamplePoint,
	TitleWatchFeed,
	TitleWatchFeedItem,
	TransferDay,
	TransferStats,
	WidgetEnvelope,
} from "./home";
