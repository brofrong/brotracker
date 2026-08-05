import { and, eq } from "drizzle-orm";
import { db } from "../../db/db";
import { titleWatches } from "../../db/title/title-watch.schema";
import { watchTasks } from "../../db/title/watch-task.schema";
import type { WatchTask, WatchTaskTrigger } from "./process-watch-task";

function toIso(value: Date | null | undefined): string | null {
	return value ? value.toISOString() : null;
}

function fromRow(row: typeof watchTasks.$inferSelect): WatchTask {
	return {
		id: row.id,
		topicUrl: row.topicUrl,
		titleId: row.titleId,
		trigger: row.trigger,
		status: row.status,
		error: row.error,
		createdAt: row.createdAt.toISOString(),
		startedAt: toIso(row.startedAt),
		finishedAt: toIso(row.finishedAt),
	};
}

export async function createWatchTask(input: {
	topicUrl: string;
	titleId: string | null;
	trigger: WatchTaskTrigger;
}): Promise<WatchTask> {
	const rows = await db
		.insert(watchTasks)
		.values({
			id: crypto.randomUUID(),
			topicUrl: input.topicUrl,
			titleId: input.titleId,
			trigger: input.trigger,
			status: "pending",
			error: null,
		})
		.returning();
	const row = rows[0];
	if (!row) {
		throw new Error("Failed to create watch task");
	}
	return fromRow(row);
}

export async function hasPendingWatchTask(topicUrl: string): Promise<boolean> {
	const rows = await db
		.select({ id: watchTasks.id })
		.from(watchTasks)
		.where(
			and(eq(watchTasks.topicUrl, topicUrl), eq(watchTasks.status, "pending")),
		)
		.limit(1);
	return rows.length > 0;
}

export async function loadWatchTask(id: string): Promise<WatchTask | null> {
	const rows = await db
		.select()
		.from(watchTasks)
		.where(eq(watchTasks.id, id))
		.limit(1);
	const row = rows[0];
	return row ? fromRow(row) : null;
}

export async function saveWatchTask(task: WatchTask): Promise<void> {
	await db
		.update(watchTasks)
		.set({
			status: task.status,
			error: task.error,
			startedAt: task.startedAt ? new Date(task.startedAt) : null,
			finishedAt: task.finishedAt ? new Date(task.finishedAt) : null,
		})
		.where(eq(watchTasks.id, task.id));
}

export async function listPendingWatchTaskIds(): Promise<string[]> {
	const rows = await db
		.select({ id: watchTasks.id })
		.from(watchTasks)
		.where(eq(watchTasks.status, "pending"));
	return rows.map((row) => row.id);
}

export async function listTrackingWatches(): Promise<
	{ topicUrl: string; titleId: string | null }[]
> {
	return db
		.select({
			topicUrl: titleWatches.topicUrl,
			titleId: titleWatches.titleId,
		})
		.from(titleWatches)
		.where(eq(titleWatches.watch, "tracking"));
}
