import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
	testQbittorrentConnection,
} from "../qbittorent/qbittorent.client";
import {
	loadQbittorrentConfig,
	qbittorrentConfigSchema,
	saveQbittorrentConfig,
} from "./qbittorrent-config";
import {
	loadRutrackerConfig,
	proxyUrlSchema,
	rutrackerConfigSchema,
	saveRutrackerConfig,
} from "./rutracker-config";
import { publicProcedure, router } from "../trpc";
import {
	clearRutrackerSession,
	getTracker,
	invalidateTracker,
	RutrackerNotConfiguredError,
} from "../torrent/torrent.tracker";

const rutrackerSetInputSchema = z.object({
	login: z.string().trim().min(1, "Login is required"),
	/** Empty string keeps the existing password. */
	password: z.string(),
	proxyUrl: proxyUrlSchema,
});

const qbittorrentSetInputSchema = z.object({
	url: z.string().trim().min(1, "URL is required"),
	/** Empty string keeps the existing API key. */
	apiKey: z.string(),
	filmsPath: z.string(),
	seriesPath: z.string(),
});

export const settingsRouter = router({
	providers: router({
		rutracker: router({
			get: publicProcedure.query(async () => {
				const config = await loadRutrackerConfig();
				if (!config) {
					return {
						login: "",
						password: "",
						hasPassword: false,
						proxyUrl: null as string | null,
					};
				}
				return {
					login: config.login,
					password: config.password,
					hasPassword: config.password.length > 0,
					proxyUrl: config.proxyUrl,
				};
			}),

			set: publicProcedure
				.input(rutrackerSetInputSchema)
				.mutation(async ({ input }) => {
					const existing = await loadRutrackerConfig();
					const password =
						input.password.length > 0
							? input.password
							: (existing?.password ?? "");

					if (!password) {
						throw new TRPCError({
							code: "BAD_REQUEST",
							message: "Password is required",
						});
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

					await saveRutrackerConfig(config);

					if (credentialsChanged) {
						await clearRutrackerSession();
						invalidateTracker();
					}

					return {
						login: config.login,
						hasPassword: true,
						proxyUrl: config.proxyUrl,
					};
				}),

			test: publicProcedure.mutation(async () => {
				try {
					const tracker = await getTracker();
					const result = await tracker._getHTML("test", {});
					if (result.isErr()) {
						throw new TRPCError({
							code: "BAD_REQUEST",
							message: result.error.message,
						});
					}
					return { ok: true as const };
				} catch (error) {
					if (error instanceof RutrackerNotConfiguredError) {
						throw new TRPCError({
							code: "PRECONDITION_FAILED",
							message: error.message,
						});
					}
					if (error instanceof TRPCError) {
						throw error;
					}
					throw new TRPCError({
						code: "BAD_REQUEST",
						message:
							error instanceof Error ? error.message : String(error),
					});
				}
			}),
		}),

		qbittorrent: router({
			get: publicProcedure.query(async () => {
				const config = await loadQbittorrentConfig();
				if (!config) {
					return {
						url: "",
						apiKey: "",
						filmsPath: "",
						seriesPath: "",
						hasApiKey: false,
						isConfigured: false,
					};
				}
				return {
					url: config.url,
					apiKey: config.apiKey,
					filmsPath: config.filmsPath,
					seriesPath: config.seriesPath,
					hasApiKey: config.apiKey.length > 0,
					isConfigured: true,
				};
			}),

			set: publicProcedure
				.input(qbittorrentSetInputSchema)
				.mutation(async ({ input }) => {
					const existing = await loadQbittorrentConfig();
					const apiKey =
						input.apiKey.length > 0
							? input.apiKey
							: (existing?.apiKey ?? "");

					if (!apiKey) {
						throw new TRPCError({
							code: "BAD_REQUEST",
							message: "API key is required",
						});
					}

					const config = qbittorrentConfigSchema.parse({
						url: input.url,
						apiKey,
						filmsPath: input.filmsPath,
						seriesPath: input.seriesPath,
					});

					await saveQbittorrentConfig(config);

					return {
						url: config.url,
						apiKey: config.apiKey,
						filmsPath: config.filmsPath,
						seriesPath: config.seriesPath,
						hasApiKey: true,
						isConfigured: true,
					};
				}),

			test: publicProcedure.mutation(async () => {
				try {
					return await testQbittorrentConnection();
				} catch (error) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message:
							error instanceof Error ? error.message : String(error),
					});
				}
			}),
		}),
	}),
});
