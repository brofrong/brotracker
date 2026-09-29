import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const titleLinks = pgTable("title_links", {
	key: text("key").primaryKey(),
	titleId: text("title_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});
