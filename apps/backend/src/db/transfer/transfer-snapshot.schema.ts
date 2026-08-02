import { bigint, date, pgTable, timestamp } from "drizzle-orm/pg-core";

/**
 * Daily snapshot of qBittorrent all-time transfer counters.
 * One row per UTC day; per-day traffic is derived as a diff between days.
 */
export const transferSnapshots = pgTable("transfer_daily_snapshots", {
	day: date("day", { mode: "string" }).primaryKey(),
	downloadedBytes: bigint("downloaded_bytes", { mode: "number" }).notNull(),
	uploadedBytes: bigint("uploaded_bytes", { mode: "number" }).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});
