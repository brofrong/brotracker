import { and, desc, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { db } from "../../db/db";
import { titleWatches } from "../../db/title/title-watch.schema";
import type { TitleWatchRecord, WatchState } from "./check-topic-now";

export type TitleWatchRow = typeof titleWatches.$inferInsert;

function toIso(value: Date | null | undefined): string | null {
	return value ? value.toISOString() : null;
}

function toDate(value: string | null): Date | null {
	return value ? new Date(value) : null;
}

export function fromWatchRow(row: TitleWatchRow): TitleWatchRecord {
	return {
		id: row.id,
		topicUrl: row.topicUrl ?? null,
		titleId: row.titleId ?? null,
		kind: row.kind ?? null,
		watch: row.watch,
		source: row.source,
		season: row.season ?? null,
		titleName: row.titleName ?? null,
		poster: row.poster ?? null,
		year: row.year ?? null,
		size: row.size ?? null,
		registeredAt: toIso(row.registeredAt),
		contentHash: row.contentHash ?? null,
		qbHash: row.qbHash ?? null,
		lastCheckedAt: toIso(row.lastCheckedAt),
		lastChangedAt: toIso(row.lastChangedAt),
		lastError: row.lastError ?? null,
		waitingOutcome: row.waitingOutcome ?? null,
		waitingOutcomeDetail: row.waitingOutcomeDetail ?? null,
		createdAt: (row.createdAt ?? new Date()).toISOString(),
	};
}

export function toWatchRow(record: TitleWatchRecord): TitleWatchRow {
	return {
		id: record.id,
		topicUrl: record.topicUrl,
		titleId: record.titleId,
		kind: record.kind,
		watch: record.watch,
		source: record.source,
		season: record.season,
		titleName: record.titleName,
		poster: record.poster,
		year: record.year,
		size: record.size,
		registeredAt: toDate(record.registeredAt),
		contentHash: record.contentHash,
		qbHash: record.qbHash,
		lastCheckedAt: toDate(record.lastCheckedAt),
		lastChangedAt: toDate(record.lastChangedAt),
		lastError: record.lastError,
		waitingOutcome: record.waitingOutcome,
		waitingOutcomeDetail: record.waitingOutcomeDetail,
		createdAt: new Date(record.createdAt),
		updatedAt: new Date(),
	};
}

export async function loadWatchById(
	id: string,
): Promise<TitleWatchRecord | null> {
	const rows = await db
		.select()
		.from(titleWatches)
		.where(eq(titleWatches.id, id))
		.limit(1);
	const row = rows[0];
	return row ? fromWatchRow(row) : null;
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
	return row ? fromWatchRow(row) : null;
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
	return row ? fromWatchRow(row) : null;
}

export async function saveWatch(record: TitleWatchRecord): Promise<void> {
	const { id: _id, createdAt: _createdAt, ...set } = toWatchRow(record);
	await db
		.insert(titleWatches)
		.values(toWatchRow(record))
		.onConflictDoUpdate({ target: titleWatches.id, set });
}

export async function deleteWatch(id: string): Promise<void> {
	await db.delete(titleWatches).where(eq(titleWatches.id, id));
}

export async function listWatchesByState(
	states: WatchState[],
): Promise<TitleWatchRecord[]> {
	if (states.length === 0) {
		return [];
	}
	const rows = await db
		.select()
		.from(titleWatches)
		.where(inArray(titleWatches.watch, states));
	return rows.map(fromWatchRow);
}

/** Watches shown on the watchlist: linked to a Title and not switched off, newest first. */
export async function listWatchlistRecords(): Promise<TitleWatchRecord[]> {
	const rows = await db
		.select()
		.from(titleWatches)
		.where(and(isNotNull(titleWatches.titleId), ne(titleWatches.watch, "off")))
		.orderBy(desc(titleWatches.createdAt));
	return rows.map(fromWatchRow);
}

/** Watches that already point at a Title (used to link live Transfers to Titles). */
export async function listTitledWatches(): Promise<
	Array<{ topicUrl: string | null; titleId: string; qbHash: string | null }>
> {
	const rows = await db
		.select({
			topicUrl: titleWatches.topicUrl,
			titleId: titleWatches.titleId,
			qbHash: titleWatches.qbHash,
		})
		.from(titleWatches)
		.where(isNotNull(titleWatches.titleId));
	return rows.flatMap((row) =>
		row.titleId
			? [{ topicUrl: row.topicUrl, titleId: row.titleId, qbHash: row.qbHash }]
			: [],
	);
}
