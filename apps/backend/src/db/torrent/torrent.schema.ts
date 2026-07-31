import {
	bigint,
	integer,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";

export const torrents = pgTable("torrents", {
	torrentId: text("torrent_id").primaryKey(),
	title: text().notNull(),
	titleNorm: text("title_norm").notNull(),
	category: text().notNull(),
	forumId: text("forum_id").notNull(),
	authorId: text("author_id").notNull(),
	size: bigint({ mode: "number" }).notNull(),
	seeds: integer().notNull(),
	leeches: integer().notNull(),
	downloads: integer().notNull(),
	registeredAt: timestamp("registered_at", { withTimezone: true }).notNull(),
	torrentFileUrl: text("torrent_file_url").notNull(),
	topicUrl: text("topic_url").notNull(),
	hdr: text().$type<"HDR" | "SDR" | null>(),
	resolution: text().$type<"4K" | "1080p" | "720p" | "SD" | null>(),
	imageKey: text("image_key"),
	lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});
