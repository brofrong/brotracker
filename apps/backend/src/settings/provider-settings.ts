import {
	clearRutrackerSession,
	invalidateTracker,
} from "../torrent/torrent.tracker";
import {
	loadQbittorrentConfig,
	loadRutrackerConfig,
	loadTmdbConfig,
	providerConfig,
} from "./provider-config.live";

export {
	loadQbittorrentConfig,
	loadRutrackerConfig,
	loadTmdbConfig,
	providerConfig,
};

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

export async function saveTmdbSettings(input: {
	apiKey: string;
	proxyUrl: string | null | undefined;
}) {
	const result = await providerConfig.saveTmdb(input);
	return result.public;
}

export type TmdbCredentials = {
	apiKey: string;
	proxyUrl: string | null;
};

/** Resolve TMDB API key + proxy from provider settings. */
export async function resolveTmdbCredentials(): Promise<
	TmdbCredentials | undefined
> {
	const stored = await loadTmdbConfig();
	if (!stored?.apiKey) {
		return undefined;
	}
	return {
		apiKey: stored.apiKey,
		proxyUrl: stored.proxyUrl ?? null,
	};
}

/** Resolve TMDB API key from provider settings. */
export async function resolveTmdbApiKey(): Promise<string | undefined> {
	const credentials = await resolveTmdbCredentials();
	return credentials?.apiKey;
}
