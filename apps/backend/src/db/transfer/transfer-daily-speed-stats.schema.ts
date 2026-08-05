import { bigint, date, integer, pgTable, timestamp } from "drizzle-orm/pg-core";

/**
 * Per-UTC-day min/avg/max of active Transfer speeds (samples with speed > 0).
 * Avg is derived as sum / active_*_samples. Feeds the Stats page history chart.
 */
export const transferDailySpeedStats = pgTable("transfer_daily_speed_stats", {
	day: date("day", { mode: "string" }).primaryKey(),
	minDownloadSpeed: bigint("min_download_speed", { mode: "number" }),
	maxDownloadSpeed: bigint("max_download_speed", { mode: "number" }),
	sumDownloadSpeed: bigint("sum_download_speed", { mode: "number" })
		.notNull()
		.default(0),
	activeDownloadSamples: integer("active_download_samples")
		.notNull()
		.default(0),
	minUploadSpeed: bigint("min_upload_speed", { mode: "number" }),
	maxUploadSpeed: bigint("max_upload_speed", { mode: "number" }),
	sumUploadSpeed: bigint("sum_upload_speed", { mode: "number" })
		.notNull()
		.default(0),
	activeUploadSamples: integer("active_upload_samples").notNull().default(0),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});
