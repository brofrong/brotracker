import { z } from "zod";
import type {
	KinozalProviderConfig,
	QbittorrentProviderConfig,
	RutrackerProviderConfig,
	TmdbProviderConfig,
} from "../db/settings/provider-settings.schema";
import {
	proxyUrlSchema,
	rutrackerConfigSchema,
} from "./rutracker-config";
import { kinozalConfigSchema } from "./kinozal-config";
import { qbittorrentConfigSchema } from "./qbittorrent-config";

export const RUTRACKER_PROVIDER = "rutracker";
export const KINOZAL_PROVIDER = "kinozal";
export const QBITTORRENT_PROVIDER = "qbittorrent";
export const TMDB_PROVIDER = "tmdb";

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
	password: string;
	proxyUrl: string | null;
	enabled: boolean;
};

export type KinozalPublic = {
	login: string;
	password: string;
	proxyUrl: string | null;
	enabled: boolean;
};

export type QbittorrentPublic = {
	url: string;
	apiKey: string;
	filmsPath: string;
	seriesPath: string;
	isConfigured: boolean;
};

export type TmdbPublic = {
	apiKey: string;
	proxyUrl: string | null;
	isConfigured: boolean;
};

export type TrackerProviderEffects = {
	clearSession: boolean;
	invalidateTracker: boolean;
};

/** @deprecated Use TrackerProviderEffects */
export type RutrackerEffects = TrackerProviderEffects;

const rutrackerStoredSchema = z.object({
	login: z.string(),
	password: z.string(),
	proxyUrl: z.string().nullable(),
	enabled: z.boolean().optional(),
});

const kinozalStoredSchema = z.object({
	login: z.string(),
	password: z.string(),
	proxyUrl: z.string().nullable(),
	enabled: z.boolean().optional(),
});

const qbittorrentStoredSchema = z.object({
	url: z.string(),
	apiKey: z.string(),
	filmsPath: z.string().optional().default(""),
	seriesPath: z.string().optional().default(""),
});

const tmdbStoredSchema = z.object({
	apiKey: z.string(),
	proxyUrl: z.string().nullable().optional(),
});

const tmdbConfigSchema = z.object({
	apiKey: z.string().min(1, "API key is required"),
	proxyUrl: proxyUrlSchema,
});

function normalizePath(value: string): string {
	return value.replace(/\/+$/, "");
}

function toRutrackerPublic(
	config: RutrackerProviderConfig | null,
): RutrackerPublic {
	if (!config) {
		return { login: "", password: "", proxyUrl: null, enabled: true };
	}
	return {
		login: config.login,
		password: config.password,
		proxyUrl: config.proxyUrl,
		enabled: config.enabled,
	};
}

function toKinozalPublic(config: KinozalProviderConfig | null): KinozalPublic {
	if (!config) {
		return { login: "", password: "", proxyUrl: null, enabled: false };
	}
	return {
		login: config.login,
		password: config.password,
		proxyUrl: config.proxyUrl,
		enabled: config.enabled,
	};
}

function toQbittorrentPublic(
	config: QbittorrentProviderConfig | null,
): QbittorrentPublic {
	if (!config) {
		return {
			url: "",
			apiKey: "",
			filmsPath: "",
			seriesPath: "",
			isConfigured: false,
		};
	}
	return {
		url: config.url,
		apiKey: config.apiKey,
		filmsPath: config.filmsPath,
		seriesPath: config.seriesPath,
		isConfigured: true,
	};
}

function toTmdbPublic(config: TmdbProviderConfig | null): TmdbPublic {
	if (!config) {
		return { apiKey: "", proxyUrl: null, isConfigured: false };
	}
	return {
		apiKey: config.apiKey,
		proxyUrl: config.proxyUrl,
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
		enabled: parsed.data.enabled ?? true,
	};
}

function parseKinozal(raw: unknown): KinozalProviderConfig | null {
	const parsed = kinozalStoredSchema.safeParse(raw);
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
		enabled: parsed.data.enabled ?? false,
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

function parseTmdb(raw: unknown): TmdbProviderConfig | null {
	const parsed = tmdbStoredSchema.safeParse(raw);
	if (!parsed.success || !parsed.data.apiKey) {
		return null;
	}
	return {
		apiKey: parsed.data.apiKey,
		proxyUrl: parsed.data.proxyUrl ?? null,
	};
}

export function createProviderConfig(store: ProviderStore) {
	async function loadRutracker(): Promise<RutrackerProviderConfig | null> {
		return parseRutracker(await store.load(RUTRACKER_PROVIDER));
	}

	async function loadQbittorrent(): Promise<QbittorrentProviderConfig | null> {
		return parseQbittorrent(await store.load(QBITTORRENT_PROVIDER));
	}

	async function loadKinozal(): Promise<KinozalProviderConfig | null> {
		return parseKinozal(await store.load(KINOZAL_PROVIDER));
	}

	async function loadTmdb(): Promise<TmdbProviderConfig | null> {
		return parseTmdb(await store.load(TMDB_PROVIDER));
	}

	return {
		loadRutracker,
		loadKinozal,
		loadQbittorrent,
		loadTmdb,

		getRutracker: async (): Promise<RutrackerPublic> =>
			toRutrackerPublic(await loadRutracker()),

		getKinozal: async (): Promise<KinozalPublic> =>
			toKinozalPublic(await loadKinozal()),

		getQbittorrent: async (): Promise<QbittorrentPublic> =>
			toQbittorrentPublic(await loadQbittorrent()),

		getTmdb: async (): Promise<TmdbPublic> =>
			toTmdbPublic(await loadTmdb()),

		saveRutracker: async (input: {
			login: string;
			password: string;
			proxyUrl: string | null | undefined;
			enabled?: boolean;
		}): Promise<{
			config: RutrackerProviderConfig;
			public: RutrackerPublic;
			effects: TrackerProviderEffects;
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
				enabled: input.enabled ?? existing?.enabled ?? true,
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

		saveKinozal: async (input: {
			login: string;
			password: string;
			proxyUrl: string | null | undefined;
			enabled?: boolean;
		}): Promise<{
			config: KinozalProviderConfig;
			public: KinozalPublic;
			effects: TrackerProviderEffects;
		}> => {
			const existing = await loadKinozal();
			const password =
				input.password.length > 0
					? input.password
					: (existing?.password ?? "");

			if (!password) {
				throw new MissingSecretError("Password is required");
			}

			const config = kinozalConfigSchema.parse({
				login: input.login,
				password,
				proxyUrl: input.proxyUrl,
				enabled: input.enabled ?? existing?.enabled ?? false,
			});

			const credentialsChanged =
				!existing ||
				existing.login !== config.login ||
				existing.password !== config.password ||
				(existing.proxyUrl ?? null) !== (config.proxyUrl ?? null);

			await store.save(KINOZAL_PROVIDER, config);

			return {
				config,
				public: toKinozalPublic(config),
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

		saveTmdb: async (input: {
			apiKey: string;
			proxyUrl: string | null | undefined;
		}): Promise<{
			config: TmdbProviderConfig;
			public: TmdbPublic;
			effects: Record<string, never>;
		}> => {
			const existing = await loadTmdb();
			const apiKey =
				input.apiKey.length > 0
					? input.apiKey
					: (existing?.apiKey ?? "");

			if (!apiKey) {
				throw new MissingSecretError("API key is required");
			}

			const config = tmdbConfigSchema.parse({
				apiKey,
				proxyUrl: input.proxyUrl,
			});
			await store.save(TMDB_PROVIDER, config);

			return {
				config,
				public: toTmdbPublic(config),
				effects: {},
			};
		},
	};
}

export type ProviderConfig = ReturnType<typeof createProviderConfig>;

/** Re-export proxy schema for router input validation. */
export { proxyUrlSchema };
