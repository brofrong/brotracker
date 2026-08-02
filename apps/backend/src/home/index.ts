import {
	getTransferStats,
	QbittorrentNotConfiguredError,
} from "../qbittorent/qbittorent.client";
import { resolveTmdbApiKey } from "../settings/provider-settings";
import { logger } from "../utils/logger";
import { createHome } from "./home";
import { createFetchDiscoverFeed } from "./tmdb-discover";
import {
	getRecentSpeeds,
	getTransferHistory,
	recordSpeedSample,
	recordTransferSnapshot,
} from "./transfer-history";

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
	getDiscoverFeed: createFetchDiscoverFeed(resolveTmdbApiKey),
});

export type {
	ComposeResponse,
	ComposeWidgetRequest,
	DiscoverCard,
	DiscoverFeed,
	Home,
	SpeedSamplePoint,
	TransferDay,
	TransferStats,
	WidgetEnvelope,
} from "./home";
