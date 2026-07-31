import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** Key–value store for application-level settings (not provider credentials). */
export const appSettings = pgTable("app_settings", {
	key: text("key").primaryKey(),
	value: text("value").notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});
