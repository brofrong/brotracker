import { and, desc, eq, notInArray, sql } from "drizzle-orm";
import { db } from "../db/db";
import {
	workerRuns,
	type WorkerLogLine,
} from "../db/workers/worker-run.schema";
import type { WorkerRunRecord, WorkerRunStore } from "./workers.types";

function fromRow(row: typeof workerRuns.$inferSelect): WorkerRunRecord {
	return {
		id: row.id,
		workerId: row.workerId,
		trigger: row.trigger,
		status: row.status,
		startedAt: row.startedAt,
		finishedAt: row.finishedAt,
		summary: row.summary,
		error: row.error,
		log: row.log ?? [],
	};
}

export function createWorkerRunStore(
	database: typeof db = db,
): WorkerRunStore {
	async function findRunning(
		workerId: string,
	): Promise<WorkerRunRecord | null> {
		const rows = await database
			.select()
			.from(workerRuns)
			.where(
				and(
					eq(workerRuns.workerId, workerId),
					eq(workerRuns.status, "running"),
				),
			)
			.limit(1);
		const row = rows[0];
		return row ? fromRow(row) : null;
	}

	return {
		async insertRunning(input) {
			try {
				const rows = await database
					.insert(workerRuns)
					.values({
						id: input.id,
						workerId: input.workerId,
						trigger: input.trigger,
						status: "running",
						startedAt: input.startedAt,
						finishedAt: null,
						summary: null,
						error: null,
						log: [],
					})
					.returning();
				const row = rows[0];
				if (!row) {
					throw new Error("Failed to insert worker run");
				}
				return fromRow(row);
			} catch (err) {
				const running = await findRunning(input.workerId);
				if (running) {
					throw new Error(
						`Worker ${input.workerId} already running (run ${running.id})`,
					);
				}
				throw err;
			}
		},

		async appendLog(id, line: WorkerLogLine) {
			const result = await database
				.update(workerRuns)
				.set({
					log: sql`coalesce(${workerRuns.log}, '[]'::jsonb) || ${JSON.stringify([line])}::jsonb`,
				})
				.where(eq(workerRuns.id, id))
				.returning({ id: workerRuns.id });
			if (result.length === 0) {
				throw new Error(`Worker run not found: ${id}`);
			}
		},

		async finish(id, result) {
			const rows = await database
				.update(workerRuns)
				.set({
					status: result.status,
					finishedAt: result.finishedAt,
					summary: result.summary,
					error: result.error,
				})
				.where(eq(workerRuns.id, id))
				.returning();
			const row = rows[0];
			if (!row) {
				throw new Error(`Worker run not found: ${id}`);
			}
			return fromRow(row);
		},

		findRunning,

		async failAllRunning(input) {
			await database
				.update(workerRuns)
				.set({
					status: "failed",
					finishedAt: input.finishedAt,
					summary: null,
					error: input.error,
				})
				.where(eq(workerRuns.status, "running"));
		},

		async listByWorker(workerId, limit) {
			const rows = await database
				.select()
				.from(workerRuns)
				.where(eq(workerRuns.workerId, workerId))
				.orderBy(desc(workerRuns.startedAt))
				.limit(limit);
			return rows.map(fromRow);
		},

		async get(id) {
			const rows = await database
				.select()
				.from(workerRuns)
				.where(eq(workerRuns.id, id))
				.limit(1);
			const row = rows[0];
			return row ? fromRow(row) : null;
		},

		async pruneOlderThan(workerId, keep) {
			if (keep <= 0) {
				await database
					.delete(workerRuns)
					.where(eq(workerRuns.workerId, workerId));
				return;
			}

			const keepRows = await database
				.select({ id: workerRuns.id })
				.from(workerRuns)
				.where(eq(workerRuns.workerId, workerId))
				.orderBy(desc(workerRuns.startedAt))
				.limit(keep);
			const keepIds = keepRows.map((row) => row.id);
			if (keepIds.length === 0) {
				return;
			}

			await database
				.delete(workerRuns)
				.where(
					and(
						eq(workerRuns.workerId, workerId),
						notInArray(workerRuns.id, keepIds),
					),
				);
		},
	};
}
