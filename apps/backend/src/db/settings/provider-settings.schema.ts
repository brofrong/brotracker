import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export type RutrackerProviderConfig = {
	login: string;
	password: string;
	proxyUrl: string | null;
};

export type QbittorrentProviderConfig = {
	url: string;
	apiKey: string;
	/** Download directory for movies (films). */
	filmsPath: string;
	/** Download directory for TV series. */
	seriesPath: string;
};

export type TmdbProviderConfig = {
	apiKey: string;
};

/** Per-provider app settings (rutracker, qbittorrent, tmdb, later kinopoisk, …). */
export const providerSettings = pgTable("provider_settings", {
	provider: text("provider").primaryKey(),
	config: jsonb("config").notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});
