import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import type { FileStoreData } from "@brotracker/rutracker-ts/tracker/storage/file-store";

/** Single-row JSON blob for RuTracker CF/session cookies (FileStore shape). */
export const rutrackerStore = pgTable("rutracker_store", {
	id: text("id").primaryKey(),
	data: jsonb("data").$type<FileStoreData>().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});
