import type {
	WorkerLogLine,
	WorkerRunStatus,
	WorkerRunTrigger,
} from "../db/workers/worker-run.schema";

export type { WorkerLogLine, WorkerRunStatus, WorkerRunTrigger };

export type WorkerRunRecord = {
	id: string;
	workerId: string;
	trigger: WorkerRunTrigger;
	status: WorkerRunStatus;
	startedAt: Date;
	finishedAt: Date | null;
	summary: string | null;
	error: string | null;
	log: WorkerLogLine[];
};

export type WorkerRunStore = {
	insertRunning(input: {
		id: string;
		workerId: string;
		trigger: WorkerRunTrigger;
		startedAt: Date;
	}): Promise<WorkerRunRecord>;
	appendLog(id: string, line: WorkerLogLine): Promise<void>;
	finish(
		id: string,
		result: {
			status: "succeeded" | "failed";
			finishedAt: Date;
			summary: string | null;
			error: string | null;
		},
	): Promise<WorkerRunRecord>;
	findRunning(workerId: string): Promise<WorkerRunRecord | null>;
	listByWorker(workerId: string, limit: number): Promise<WorkerRunRecord[]>;
	get(id: string): Promise<WorkerRunRecord | null>;
	pruneOlderThan(workerId: string, keep: number): Promise<void>;
};
