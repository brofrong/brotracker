import { bigint, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export type TitleWatchEventKind =
	| "torrent-updated"
	| "progress-changed"
	| "completed"
	| "check-failed";

export const titleWatchEvents = pgTable(
	"title_watch_events",
	{
		id: text("id").primaryKey(),
		titleId: text("title_id"),
		topicUrl: text("topic_url").notNull(),
		kind: text("kind").$type<TitleWatchEventKind>().notNull(),
		message: text("message"),
		previousSize: bigint("previous_size", { mode: "number" }),
		newSize: bigint("new_size", { mode: "number" }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [index("title_watch_events_created_at_idx").on(table.createdAt)],
);
