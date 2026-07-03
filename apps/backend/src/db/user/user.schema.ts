import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const userTable = sqliteTable("users", {
	id: integer({ mode: "number" }).primaryKey(),
	email: text().notNull(),
	password: text().notNull(),
	createdAt: integer("created_at", { mode: "timestamp" }).default(
		sql`(CURRENT_TIMESTAMP)`,
	),
});
