import { sql } from "drizzle-orm";
import {
	index,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

export type WorkerRunTrigger = "scheduled" | "manual";
export type WorkerRunStatus = "running" | "succeeded" | "failed";
export type WorkerLogLevel = "info" | "warn" | "error";
export type WorkerLogLine = {
	ts: string;
	level: WorkerLogLevel;
	message: string;
};

export const workerRuns = pgTable(
	"worker_runs",
	{
		id: text("id").primaryKey(),
		workerId: text("worker_id").notNull(),
		trigger: text("trigger").$type<WorkerRunTrigger>().notNull(),
		status: text("status").$type<WorkerRunStatus>().notNull(),
		startedAt: timestamp("started_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		finishedAt: timestamp("finished_at", { withTimezone: true }),
		summary: text("summary"),
		error: text("error"),
		log: jsonb("log").$type<WorkerLogLine[]>().notNull().default([]),
	},
	(table) => [
		index("worker_runs_worker_id_started_at_idx").on(
			table.workerId,
			table.startedAt,
		),
		uniqueIndex("worker_runs_one_running_per_worker")
			.on(table.workerId)
			.where(sql`${table.status} = 'running'`),
	],
);
