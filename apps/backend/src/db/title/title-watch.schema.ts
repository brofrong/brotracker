import {
	bigint,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";

export type TitleWatchState = "tracking" | "paused" | "completed" | "off";
export type TitleWatchSource = "auto-qb" | "manual";

export const titleWatches = pgTable("title_watches", {
	topicUrl: text("topic_url").primaryKey(),
	titleId: text("title_id"),
	watch: text("watch").$type<TitleWatchState>().notNull(),
	source: text("source").$type<TitleWatchSource>().notNull(),
	size: bigint({ mode: "number" }),
	registeredAt: timestamp("registered_at", { withTimezone: true }),
	contentHash: text("content_hash"),
	qbHash: text("qb_hash"),
	lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
	lastChangedAt: timestamp("last_changed_at", { withTimezone: true }),
	lastError: text("last_error"),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});
