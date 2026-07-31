import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/db";
import {
	type QbittorrentProviderConfig,
	providerSettings,
} from "../db/settings/provider-settings.schema";

export const QBITTORRENT_PROVIDER = "qbittorrent";

const pathSchema = z
	.string()
	.trim()
	.transform((value) => value.replace(/\/+$/, ""));

export const qbittorrentConfigSchema = z.object({
	url: z
		.string()
		.trim()
		.min(1, "URL is required")
		.refine((value) => {
			try {
				const parsed = new URL(value);
				return parsed.protocol === "http:" || parsed.protocol === "https:";
			} catch {
				return false;
			}
		}, "Must be a valid http(s) URL"),
	apiKey: z.string().min(1, "API key is required"),
	filmsPath: pathSchema,
	seriesPath: pathSchema,
});

const storedConfigSchema = z.object({
	url: z.string(),
	apiKey: z.string(),
	filmsPath: z.string().optional().default(""),
	seriesPath: z.string().optional().default(""),
});

export async function loadQbittorrentConfig(): Promise<QbittorrentProviderConfig | null> {
	const rows = await db
		.select({ config: providerSettings.config })
		.from(providerSettings)
		.where(eq(providerSettings.provider, QBITTORRENT_PROVIDER))
		.limit(1);

	const row = rows[0];
	if (!row) {
		return null;
	}

	const parsed = storedConfigSchema.safeParse(row.config);
	if (!parsed.success) {
		return null;
	}
	if (!parsed.data.url || !parsed.data.apiKey) {
		return null;
	}

	return {
		url: parsed.data.url.replace(/\/+$/, ""),
		apiKey: parsed.data.apiKey,
		filmsPath: parsed.data.filmsPath.replace(/\/+$/, ""),
		seriesPath: parsed.data.seriesPath.replace(/\/+$/, ""),
	};
}

export async function saveQbittorrentConfig(
	config: QbittorrentProviderConfig,
): Promise<void> {
	const now = new Date();
	const normalized: QbittorrentProviderConfig = {
		url: config.url.replace(/\/+$/, ""),
		apiKey: config.apiKey,
		filmsPath: config.filmsPath.replace(/\/+$/, ""),
		seriesPath: config.seriesPath.replace(/\/+$/, ""),
	};
	await db
		.insert(providerSettings)
		.values({
			provider: QBITTORRENT_PROVIDER,
			config: normalized,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: providerSettings.provider,
			set: { config: normalized, updatedAt: now },
		});
}
