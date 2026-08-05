import { desc } from "drizzle-orm";
import { db } from "../../db/db";
import { titleWatchEvents } from "../../db/title/title-watch-event.schema";
import type { TitleWatchEvent, WatchEventStore } from "./title-watch-event";

function fromRow(row: typeof titleWatchEvents.$inferSelect): TitleWatchEvent {
	return {
		id: row.id,
		titleId: row.titleId,
		topicUrl: row.topicUrl,
		kind: row.kind,
		message: row.message,
		previousSize: row.previousSize,
		newSize: row.newSize,
		createdAt: row.createdAt.toISOString(),
	};
}

export async function appendWatchEvent(event: TitleWatchEvent): Promise<void> {
	await db.insert(titleWatchEvents).values({
		id: event.id,
		titleId: event.titleId,
		topicUrl: event.topicUrl,
		kind: event.kind,
		message: event.message,
		previousSize: event.previousSize,
		newSize: event.newSize,
		createdAt: new Date(event.createdAt),
	});
}

export async function listRecentWatchEvents(
	limit: number,
): Promise<TitleWatchEvent[]> {
	const rows = await db
		.select()
		.from(titleWatchEvents)
		.orderBy(desc(titleWatchEvents.createdAt))
		.limit(limit);
	return rows.map(fromRow);
}

export const watchEventStore: WatchEventStore = {
	append: appendWatchEvent,
	listRecent: listRecentWatchEvents,
};
