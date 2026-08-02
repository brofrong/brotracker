import {
	clearRutrackerSession,
	invalidateTracker,
} from "../torrent/torrent.tracker";
import {
	loadQbittorrentConfig,
	loadRutrackerConfig,
	providerConfig,
} from "./provider-config.live";

export { loadQbittorrentConfig, loadRutrackerConfig, providerConfig };

/** Settings mutations: persist + apply provider side effects. */
export async function saveRutrackerSettings(input: {
	login: string;
	password: string;
	proxyUrl: string | null | undefined;
}) {
	const result = await providerConfig.saveRutracker(input);
	if (result.effects.clearSession) {
		await clearRutrackerSession();
	}
	if (result.effects.invalidateTracker) {
		invalidateTracker();
	}
	return result.public;
}

export async function saveQbittorrentSettings(input: {
	url: string;
	apiKey: string;
	filmsPath: string;
	seriesPath: string;
}) {
	const result = await providerConfig.saveQbittorrent(input);
	return result.public;
}
