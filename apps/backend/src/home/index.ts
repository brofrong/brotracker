import {
	getTransferStats,
	QbittorrentNotConfiguredError,
} from "../qbittorent/qbittorent.client";
import { resolveTmdbApiKey } from "../settings/provider-settings";
import { listRecentWatchEvents } from "../title/title-watch-event.repository";
import { createHome } from "./home";
import { createFetchDiscoverFeed } from "./tmdb-discover";

const TITLE_WATCH_FEED_LIMIT = 20;

export const home = createHome({
	getTransferStats: async () => {
		try {
			return await getTransferStats();
		} catch (error) {
			if (error instanceof QbittorrentNotConfiguredError) {
				return null;
			}
			throw error;
		}
	},
	getDiscoverFeed: createFetchDiscoverFeed(resolveTmdbApiKey),
	getTitleWatchEvents: () => listRecentWatchEvents(TITLE_WATCH_FEED_LIMIT),
});

export type {
	ComposeResponse,
	ComposeWidgetRequest,
	DiscoverCard,
	DiscoverFeed,
	Home,
	TitleWatchFeed,
	TitleWatchFeedItem,
	TransferStats,
	WidgetEnvelope,
} from "./home";
