import {
	bigint,
	integer,
	pgTable,
	text,
	timestamp,
	unique,
} from "drizzle-orm/pg-core";

export type TitleWatchState =
	"waiting" | "downloading" | "tracking" | "paused" | "completed" | "off";
export type TitleWatchSource = "auto-qb" | "manual";
export type TitleWatchKind = "films" | "tv";
export type TitleWatchWaitingOutcome =
	| "no-releases"
	| "only-camrip"
	| "below-resolution"
	| "no-hdr"
	| "no-voice"
	| "search-failed";

/** One TitleWatch per Title; the Topic is attached once a release is found. */
export const titleWatches = pgTable(
	"title_watches",
	{
		id: text("id").primaryKey(),
		topicUrl: text("topic_url"),
		titleId: text("title_id"),
		kind: text("kind").$type<TitleWatchKind>(),
		watch: text("watch").$type<TitleWatchState>().notNull(),
		source: text("source").$type<TitleWatchSource>().notNull(),
		season: integer("season"),
		titleName: text("title_name"),
		poster: text("poster"),
		year: integer("year"),
		size: bigint({ mode: "number" }),
		registeredAt: timestamp("registered_at", { withTimezone: true }),
		contentHash: text("content_hash"),
		qbHash: text("qb_hash"),
		lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
		lastChangedAt: timestamp("last_changed_at", { withTimezone: true }),
		lastError: text("last_error"),
		waitingOutcome: text("waiting_outcome").$type<TitleWatchWaitingOutcome>(),
		waitingOutcomeDetail: text("waiting_outcome_detail"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [unique("title_watches_topic_url_unique").on(table.topicUrl)],
);
