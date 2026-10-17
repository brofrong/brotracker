import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/db";
import { appSettings } from "../db/settings/app-settings.schema";

export const WATCHLIST_SETTINGS_KEY = "watchlist_settings";

export const watchlistSettingsSchema = z.object({
	checkIntervalHours: z.union([
		z.literal(1),
		z.literal(2),
		z.literal(4),
		z.literal(6),
		z.literal(12),
		z.literal(24),
	]),
	minResolution: z.enum(["720p", "1080p", "4K"]),
	hdrOnly: z.boolean(),
	requireRussianVoice: z.boolean(),
});

export type WatchlistSettings = z.infer<typeof watchlistSettingsSchema>;

export const DEFAULT_WATCHLIST_SETTINGS: WatchlistSettings = {
	checkIntervalHours: 24,
	minResolution: "1080p",
	hdrOnly: false,
	requireRussianVoice: true,
};

/**
 * Parse persisted watchlist settings JSON.
 * - `null`, invalid JSON, or a non-object shape → defaults.
 * - A partial object is merged over defaults; if the merged result still
 *   fails validation (e.g. an out-of-range value), falls back to defaults.
 */
export function parseWatchlistSettings(raw: string | null): WatchlistSettings {
	if (raw === null) {
		return DEFAULT_WATCHLIST_SETTINGS;
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return DEFAULT_WATCHLIST_SETTINGS;
	}

	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		return DEFAULT_WATCHLIST_SETTINGS;
	}

	const merged = { ...DEFAULT_WATCHLIST_SETTINGS, ...parsed };
	const result = watchlistSettingsSchema.safeParse(merged);
	return result.success ? result.data : DEFAULT_WATCHLIST_SETTINGS;
}

/** Load watchlist settings from `app_settings`, falling back to defaults. */
export async function loadWatchlistSettings(): Promise<WatchlistSettings> {
	const existing = await db
		.select({ value: appSettings.value })
		.from(appSettings)
		.where(eq(appSettings.key, WATCHLIST_SETTINGS_KEY))
		.limit(1);

	return parseWatchlistSettings(existing[0]?.value ?? null);
}

/** Persist watchlist settings as JSON in `app_settings` (upsert). */
export async function saveWatchlistSettings(
	input: WatchlistSettings,
): Promise<WatchlistSettings> {
	const value = JSON.stringify(input);

	await db
		.insert(appSettings)
		.values({
			key: WATCHLIST_SETTINGS_KEY,
			value,
		})
		.onConflictDoUpdate({
			target: appSettings.key,
			set: { value, updatedAt: new Date() },
		});

	return input;
}
