import { bigint, index, pgTable, timestamp } from "drizzle-orm/pg-core";

/**
 * Instantaneous qBittorrent transfer speeds (B/s), sampled on the home page
 * polling interval plus an hourly scheduler tick. Feeds per-day average
 * speed stats.
 */
export const transferSpeedSamples = pgTable(
	"transfer_speed_samples",
	{
		sampledAt: timestamp("sampled_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		downloadSpeed: bigint("download_speed", { mode: "number" }).notNull(),
		uploadSpeed: bigint("upload_speed", { mode: "number" }).notNull(),
	},
	(table) => [
		index("transfer_speed_samples_sampled_at_idx").on(table.sampledAt),
	],
);
