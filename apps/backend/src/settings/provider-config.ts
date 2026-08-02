import { z } from "zod";
import type {
	QbittorrentProviderConfig,
	RutrackerProviderConfig,
} from "../db/settings/provider-settings.schema";
import {
	proxyUrlSchema,
	rutrackerConfigSchema,
} from "./rutracker-config";
import { qbittorrentConfigSchema } from "./qbittorrent-config";

export const RUTRACKER_PROVIDER = "rutracker";
export const QBITTORRENT_PROVIDER = "qbittorrent";

export class MissingSecretError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "MissingSecretError";
	}
}

export type ProviderStore = {
	load: (provider: string) => Promise<unknown | null>;
	save: (provider: string, config: unknown) => Promise<void>;
};

export type RutrackerPublic = {
	login: string;
	hasPassword: boolean;
	proxyUrl: string | null;
};

export type QbittorrentPublic = {
	url: string;
	hasApiKey: boolean;
	filmsPath: string;
	seriesPath: string;
	isConfigured: boolean;
};

export type RutrackerEffects = {
	clearSession: boolean;
	invalidateTracker: boolean;
};

const rutrackerStoredSchema = z.object({
	login: z.string(),
	password: z.string(),
	proxyUrl: z.string().nullable(),
});

const qbittorrentStoredSchema = z.object({
	url: z.string(),
	apiKey: z.string(),
	filmsPath: z.string().optional().default(""),
	seriesPath: z.string().optional().default(""),
});

function normalizePath(value: string): string {
	return value.replace(/\/+$/, "");
}

function toRutrackerPublic(
	config: RutrackerProviderConfig | null,
): RutrackerPublic {
	if (!config) {
		return { login: "", hasPassword: false, proxyUrl: null };
	}
	return {
		login: config.login,
		hasPassword: config.password.length > 0,
		proxyUrl: config.proxyUrl,
	};
}

function toQbittorrentPublic(
	config: QbittorrentProviderConfig | null,
): QbittorrentPublic {
	if (!config) {
		return {
			url: "",
			hasApiKey: false,
			filmsPath: "",
			seriesPath: "",
			isConfigured: false,
		};
	}
	return {
		url: config.url,
		hasApiKey: config.apiKey.length > 0,
		filmsPath: config.filmsPath,
		seriesPath: config.seriesPath,
		isConfigured: true,
	};
}

function parseRutracker(raw: unknown): RutrackerProviderConfig | null {
	const parsed = rutrackerStoredSchema.safeParse(raw);
	if (!parsed.success) {
		return null;
	}
	if (!parsed.data.login || !parsed.data.password) {
		return null;
	}
	return {
		login: parsed.data.login,
		password: parsed.data.password,
		proxyUrl: parsed.data.proxyUrl,
	};
}

function parseQbittorrent(raw: unknown): QbittorrentProviderConfig | null {
	const parsed = qbittorrentStoredSchema.safeParse(raw);
	if (!parsed.success) {
		return null;
	}
	if (!parsed.data.url || !parsed.data.apiKey) {
		return null;
	}
	return {
		url: normalizePath(parsed.data.url),
		apiKey: parsed.data.apiKey,
		filmsPath: normalizePath(parsed.data.filmsPath),
		seriesPath: normalizePath(parsed.data.seriesPath),
	};
}

export function createProviderConfig(store: ProviderStore) {
	async function loadRutracker(): Promise<RutrackerProviderConfig | null> {
		return parseRutracker(await store.load(RUTRACKER_PROVIDER));
	}

	async function loadQbittorrent(): Promise<QbittorrentProviderConfig | null> {
		return parseQbittorrent(await store.load(QBITTORRENT_PROVIDER));
	}

	return {
		loadRutracker,
		loadQbittorrent,

		getRutracker: async (): Promise<RutrackerPublic> =>
			toRutrackerPublic(await loadRutracker()),

		getQbittorrent: async (): Promise<QbittorrentPublic> =>
			toQbittorrentPublic(await loadQbittorrent()),

		saveRutracker: async (input: {
			login: string;
			password: string;
			proxyUrl: string | null | undefined;
		}): Promise<{
			config: RutrackerProviderConfig;
			public: RutrackerPublic;
			effects: RutrackerEffects;
		}> => {
			const existing = await loadRutracker();
			const password =
				input.password.length > 0
					? input.password
					: (existing?.password ?? "");

			if (!password) {
				throw new MissingSecretError("Password is required");
			}

			const config = rutrackerConfigSchema.parse({
				login: input.login,
				password,
				proxyUrl: input.proxyUrl,
			});

			const credentialsChanged =
				!existing ||
				existing.login !== config.login ||
				existing.password !== config.password ||
				(existing.proxyUrl ?? null) !== (config.proxyUrl ?? null);

			await store.save(RUTRACKER_PROVIDER, config);

			return {
				config,
				public: toRutrackerPublic(config),
				effects: {
					clearSession: credentialsChanged,
					invalidateTracker: credentialsChanged,
				},
			};
		},

		saveQbittorrent: async (input: {
			url: string;
			apiKey: string;
			filmsPath: string;
			seriesPath: string;
		}): Promise<{
			config: QbittorrentProviderConfig;
			public: QbittorrentPublic;
			effects: Record<string, never>;
		}> => {
			const existing = await loadQbittorrent();
			const apiKey =
				input.apiKey.length > 0
					? input.apiKey
					: (existing?.apiKey ?? "");

			if (!apiKey) {
				throw new MissingSecretError("API key is required");
			}

			const parsed = qbittorrentConfigSchema.parse({
				url: input.url,
				apiKey,
				filmsPath: input.filmsPath,
				seriesPath: input.seriesPath,
			});
			const config: QbittorrentProviderConfig = {
				url: normalizePath(parsed.url),
				apiKey: parsed.apiKey,
				filmsPath: normalizePath(parsed.filmsPath),
				seriesPath: normalizePath(parsed.seriesPath),
			};

			await store.save(QBITTORRENT_PROVIDER, config);

			return {
				config,
				public: toQbittorrentPublic(config),
				effects: {},
			};
		},
	};
}

export type ProviderConfig = ReturnType<typeof createProviderConfig>;

/** Re-export proxy schema for router input validation. */
export { proxyUrlSchema };
