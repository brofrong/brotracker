import {
	getTransferStats,
	QbittorrentNotConfiguredError,
} from "../qbittorent/qbittorent.client";
import { resolveTmdbApiKey } from "../settings/provider-settings";
import { createHome } from "./home";
import { createFetchDiscoverFeed } from "./tmdb-discover";

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
});

export type {
	ComposeResponse,
	ComposeWidgetRequest,
	DiscoverCard,
	DiscoverFeed,
	Home,
	TransferStats,
	WidgetEnvelope,
} from "./home";
