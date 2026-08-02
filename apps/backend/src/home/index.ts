import {
	getTransferStats,
	QbittorrentNotConfiguredError,
} from "../qbittorent/qbittorent.client";
import { createHome } from "./home";

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
});

export type {
	ComposeResponse,
	ComposeWidgetRequest,
	Home,
	TransferStats,
	WidgetEnvelope,
} from "./home";
