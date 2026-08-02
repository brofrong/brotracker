import { eq } from "drizzle-orm";
import { db } from "../db/db";
import { titleWatches } from "../db/title/title-watch.schema";
import type { TitleWatchRecord } from "./check-topic-now";

function toIso(value: Date | null | undefined): string | null {
	return value ? value.toISOString() : null;
}

function fromRow(row: typeof titleWatches.$inferSelect): TitleWatchRecord {
	return {
		topicUrl: row.topicUrl,
		titleId: row.titleId,
		watch: row.watch,
		source: row.source,
		size: row.size,
		registeredAt: toIso(row.registeredAt),
		contentHash: row.contentHash,
		qbHash: row.qbHash,
		lastCheckedAt: toIso(row.lastCheckedAt),
		lastChangedAt: toIso(row.lastChangedAt),
		lastError: row.lastError,
	};
}

function toRow(record: TitleWatchRecord) {
	return {
		topicUrl: record.topicUrl,
		titleId: record.titleId,
		watch: record.watch,
		source: record.source,
		size: record.size,
		registeredAt: record.registeredAt
			? new Date(record.registeredAt)
			: null,
		contentHash: record.contentHash,
		qbHash: record.qbHash,
		lastCheckedAt: record.lastCheckedAt
			? new Date(record.lastCheckedAt)
			: null,
		lastChangedAt: record.lastChangedAt
			? new Date(record.lastChangedAt)
			: null,
		lastError: record.lastError,
		updatedAt: new Date(),
	};
}

export async function loadWatchByTopicUrl(
	topicUrl: string,
): Promise<TitleWatchRecord | null> {
	const rows = await db
		.select()
		.from(titleWatches)
		.where(eq(titleWatches.topicUrl, topicUrl))
		.limit(1);
	const row = rows[0];
	return row ? fromRow(row) : null;
}

export async function loadWatchByTitleId(
	titleId: string,
): Promise<TitleWatchRecord | null> {
	const rows = await db
		.select()
		.from(titleWatches)
		.where(eq(titleWatches.titleId, titleId))
		.limit(1);
	const row = rows[0];
	return row ? fromRow(row) : null;
}

export async function saveWatch(record: TitleWatchRecord): Promise<void> {
	const values = toRow(record);
	await db
		.insert(titleWatches)
		.values(values)
		.onConflictDoUpdate({
			target: titleWatches.topicUrl,
			set: {
				titleId: values.titleId,
				watch: values.watch,
				source: values.source,
				size: values.size,
				registeredAt: values.registeredAt,
				contentHash: values.contentHash,
				qbHash: values.qbHash,
				lastCheckedAt: values.lastCheckedAt,
				lastChangedAt: values.lastChangedAt,
				lastError: values.lastError,
				updatedAt: values.updatedAt,
			},
		});
}
