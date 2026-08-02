import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export type WatchTaskTrigger = "nightly" | "manual";
export type WatchTaskStatus = "pending" | "running" | "succeeded" | "failed";

export const watchTasks = pgTable(
	"watch_tasks",
	{
		id: text("id").primaryKey(),
		topicUrl: text("topic_url").notNull(),
		titleId: text("title_id"),
		trigger: text("trigger").$type<WatchTaskTrigger>().notNull(),
		status: text("status").$type<WatchTaskStatus>().notNull(),
		error: text("error"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		startedAt: timestamp("started_at", { withTimezone: true }),
		finishedAt: timestamp("finished_at", { withTimezone: true }),
	},
	(table) => [
		index("watch_tasks_topic_url_status_idx").on(table.topicUrl, table.status),
	],
);
