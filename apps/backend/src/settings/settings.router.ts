import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { testQbittorrentConnection } from "../qbittorent/qbittorent.client";
import {
	getTracker,
	RutrackerNotConfiguredError,
} from "../torrent/torrent.tracker";
import { logger } from "../utils/logger";
import { protectedProcedure, router } from "../trpc";
import { MissingSecretError, proxyUrlSchema } from "./provider-config";
import { providerConfig } from "./provider-config.live";
import {
	resolveTmdbApiKey,
	saveQbittorrentSettings,
	saveRutrackerSettings,
	saveTmdbSettings,
} from "./provider-settings";

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

const tmdbSetInputSchema = z.object({
	/** Empty string keeps the existing API key. */
	apiKey: z.string(),
});

function mapSecretError(error: unknown): never {
	if (error instanceof MissingSecretError) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: error.message,
		});
	}
	throw error;
}

async function testTmdbConnection(): Promise<{ ok: true }> {
	const apiKey = await resolveTmdbApiKey();
	if (!apiKey) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "TMDB API key is not configured. Set it in Settings.",
		});
	}

	const url = `https://api.themoviedb.org/3/configuration?api_key=${encodeURIComponent(apiKey)}`;
	try {
		const response = await fetch(url, {
			headers: { Accept: "application/json" },
		});
		if (!response.ok) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: `TMDB ответил ${response.status}`,
			});
		}
		return { ok: true as const };
	} catch (error) {
		if (error instanceof TRPCError) {
			throw error;
		}
		logger.warn(
			{ err: error instanceof Error ? error.message : String(error) },
			"tmdb connection test failed",
		);
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				error instanceof Error ? error.message : "TMDB connection failed",
		});
	}
}

export const settingsRouter = router({
	providers: router({
		rutracker: router({
			get: protectedProcedure.query(async () => providerConfig.getRutracker()),

			set: protectedProcedure
				.input(rutrackerSetInputSchema)
				.mutation(async ({ input }) => {
					try {
						return await saveRutrackerSettings(input);
					} catch (error) {
						mapSecretError(error);
					}
				}),

			test: protectedProcedure.mutation(async () => {
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
			get: protectedProcedure.query(async () =>
				providerConfig.getQbittorrent(),
			),

			set: protectedProcedure
				.input(qbittorrentSetInputSchema)
				.mutation(async ({ input }) => {
					try {
						return await saveQbittorrentSettings(input);
					} catch (error) {
						mapSecretError(error);
					}
				}),

			test: protectedProcedure.mutation(async () => {
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

		tmdb: router({
			get: protectedProcedure.query(async () => providerConfig.getTmdb()),

			set: protectedProcedure
				.input(tmdbSetInputSchema)
				.mutation(async ({ input }) => {
					try {
						return await saveTmdbSettings(input);
					} catch (error) {
						mapSecretError(error);
					}
				}),

			test: protectedProcedure.mutation(async () => testTmdbConnection()),
		}),
	}),
});
