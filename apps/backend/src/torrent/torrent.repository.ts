import type { SearchResult } from "@brotracker/rutracker-ts/tracker/tracker-interface";
import { sql } from "drizzle-orm";
import { db } from "../db/db";
import { torrents } from "../db/torrent/torrent.schema";
import { publicUrl } from "../storage/s3";
import { normalizeTitle } from "./title-norm";

export const TITLE_SIMILARITY_THRESHOLD = 0.3;

export type LocalSearchResult = SearchResult & {
	imageUrl: string | null;
};

type TorrentRow = {
	torrent_id: string;
	title: string;
	title_norm: string;
	category: string;
	forum_id: string;
	author_id: string;
	size: number | string | bigint;
	seeds: number;
	leeches: number;
	downloads: number;
	registered_at: Date | string;
	torrent_file_url: string;
	topic_url: string;
	hdr: "HDR" | "SDR" | null;
	resolution: "4K" | "1080p" | "720p" | "SD" | null;
	image_key: string | null;
	last_seen_at: Date | string;
	score?: number;
};

function mapRow(row: TorrentRow): LocalSearchResult {
	return {
		torrentId: row.torrent_id,
		title: row.title,
		category: row.category,
		forumId: row.forum_id,
		authorId: row.author_id,
		size: Number(row.size),
		seeds: row.seeds,
		leeches: row.leeches,
		downloads: row.downloads,
		date:
			row.registered_at instanceof Date
				? row.registered_at
				: new Date(row.registered_at),
		torrentFileUrl: row.torrent_file_url,
		topicUrl: row.topic_url,
		hdr: row.hdr,
		resolution: row.resolution,
		imageUrl: row.image_key ? publicUrl(row.image_key) : null,
	};
}

export async function searchLocal(
	queryNorm: string,
): Promise<LocalSearchResult[]> {
	// word_similarity: short user queries vs long torrent titles (full-string similarity is too low)
	const rows = await db.execute<TorrentRow>(sql`
		SELECT *, word_similarity(${queryNorm}, title_norm) AS score
		FROM torrents
		WHERE ${queryNorm} <% title_norm
		  AND word_similarity(${queryNorm}, title_norm) >= ${TITLE_SIMILARITY_THRESHOLD}
		ORDER BY score DESC, seeds DESC
		LIMIT 100
	`);
	return rows.map(mapRow);
}

export async function upsertFromTracker(
	results: SearchResult[],
): Promise<void> {
	if (results.length === 0) {
		return;
	}

	const now = new Date();
	const values = results.map((r) => ({
		torrentId: r.torrentId,
		title: r.title,
		titleNorm: normalizeTitle(r.title),
		category: r.category,
		forumId: r.forumId,
		authorId: r.authorId,
		size: r.size,
		seeds: r.seeds,
		leeches: r.leeches,
		downloads: r.downloads,
		registeredAt: r.date,
		torrentFileUrl: r.torrentFileUrl,
		topicUrl: r.topicUrl,
		hdr: r.hdr,
		resolution: r.resolution,
		lastSeenAt: now,
	}));

	await db
		.insert(torrents)
		.values(values)
		.onConflictDoUpdate({
			target: torrents.torrentId,
			set: {
				title: sql`excluded.title`,
				titleNorm: sql`excluded.title_norm`,
				category: sql`excluded.category`,
				forumId: sql`excluded.forum_id`,
				authorId: sql`excluded.author_id`,
				size: sql`excluded.size`,
				seeds: sql`excluded.seeds`,
				leeches: sql`excluded.leeches`,
				downloads: sql`excluded.downloads`,
				registeredAt: sql`excluded.registered_at`,
				torrentFileUrl: sql`excluded.torrent_file_url`,
				topicUrl: sql`excluded.topic_url`,
				hdr: sql`excluded.hdr`,
				resolution: sql`excluded.resolution`,
				lastSeenAt: sql`excluded.last_seen_at`,
				// intentionally omit image_key — preserve existing cover
			},
		});
}
