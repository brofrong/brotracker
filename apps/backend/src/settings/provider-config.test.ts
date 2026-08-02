import { describe, expect, test } from "bun:test";
import {
	createProviderConfig,
	MissingSecretError,
	type ProviderStore,
} from "./provider-config";

function memoryStore(
	initial: Record<string, unknown> = {},
): ProviderStore & { data: Record<string, unknown> } {
	const data = { ...initial };
	return {
		data,
		load: async (provider) => data[provider] ?? null,
		save: async (provider, config) => {
			data[provider] = config;
		},
	};
}

describe("provider-config rutracker", () => {
	test("get returns redacted DTO without password", async () => {
		const store = memoryStore({
			rutracker: {
				login: "alice",
				password: "secret",
				proxyUrl: "socks5://127.0.0.1:1080",
			},
		});
		const providers = createProviderConfig(store);

		await expect(providers.getRutracker()).resolves.toEqual({
			login: "alice",
			hasPassword: true,
			proxyUrl: "socks5://127.0.0.1:1080",
		});
	});

	test("save keeps existing password when incoming password is empty", async () => {
		const store = memoryStore({
			rutracker: {
				login: "alice",
				password: "secret",
				proxyUrl: null,
			},
		});
		const providers = createProviderConfig(store);

		const result = await providers.saveRutracker({
			login: "alice",
			password: "",
			proxyUrl: "http://proxy:8080",
		});

		expect(result.public).toEqual({
			login: "alice",
			hasPassword: true,
			proxyUrl: "http://proxy:8080",
		});
		expect(result.effects).toEqual({
			clearSession: true,
			invalidateTracker: true,
		});
		expect(store.data.rutracker).toEqual({
			login: "alice",
			password: "secret",
			proxyUrl: "http://proxy:8080",
		});
	});

	test("save rejects first-time empty password", async () => {
		const providers = createProviderConfig(memoryStore());

		await expect(
			providers.saveRutracker({
				login: "alice",
				password: "",
				proxyUrl: null,
			}),
		).rejects.toBeInstanceOf(MissingSecretError);
	});

	test("save with unchanged credentials does not request invalidation", async () => {
		const store = memoryStore({
			rutracker: {
				login: "alice",
				password: "secret",
				proxyUrl: null,
			},
		});
		const providers = createProviderConfig(store);

		const result = await providers.saveRutracker({
			login: "alice",
			password: "",
			proxyUrl: null,
		});

		expect(result.effects).toEqual({
			clearSession: false,
			invalidateTracker: false,
		});
	});
});

describe("provider-config qbittorrent", () => {
	test("get returns redacted DTO without apiKey", async () => {
		const store = memoryStore({
			qbittorrent: {
				url: "http://qb:8080/",
				apiKey: "key",
				filmsPath: "/films/",
				seriesPath: "/series/",
			},
		});
		const providers = createProviderConfig(store);

		await expect(providers.getQbittorrent()).resolves.toEqual({
			url: "http://qb:8080",
			hasApiKey: true,
			filmsPath: "/films",
			seriesPath: "/series",
			isConfigured: true,
		});
	});

	test("save keeps existing apiKey when incoming is empty", async () => {
		const store = memoryStore({
			qbittorrent: {
				url: "http://qb:8080",
				apiKey: "old-key",
				filmsPath: "/films",
				seriesPath: "/series",
			},
		});
		const providers = createProviderConfig(store);

		const result = await providers.saveQbittorrent({
			url: "http://qb:9090/",
			apiKey: "",
			filmsPath: "/movies/",
			seriesPath: "/tv/",
		});

		expect(result.public).toEqual({
			url: "http://qb:9090",
			hasApiKey: true,
			filmsPath: "/movies",
			seriesPath: "/tv",
			isConfigured: true,
		});
		expect(store.data.qbittorrent).toEqual({
			url: "http://qb:9090",
			apiKey: "old-key",
			filmsPath: "/movies",
			seriesPath: "/tv",
		});
	});
});
