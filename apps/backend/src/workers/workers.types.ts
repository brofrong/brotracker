import type {
	WorkerLogLevel,
	WorkerLogLine,
	WorkerRunStatus,
	WorkerRunTrigger,
} from "../db/workers/worker-run.schema";

export type {
	WorkerLogLevel,
	WorkerLogLine,
	WorkerRunStatus,
	WorkerRunTrigger,
};

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
	failAllRunning(input: {
		finishedAt: Date;
		error: string;
	}): Promise<void>;
	listByWorker(workerId: string, limit: number): Promise<WorkerRunRecord[]>;
	get(id: string): Promise<WorkerRunRecord | null>;
	pruneOlderThan(workerId: string, keep: number): Promise<void>;
};

export type WorkerDefinition = {
	id: string;
	name: string;
	description: string;
	execute: (ctx: {
		log: (level: WorkerLogLevel, message: string) => void | Promise<void>;
	}) => Promise<{ summary: string }>;
};

export type WorkerLiveStatus = "running" | "idle";

export type WorkerListItem = {
	id: string;
	name: string;
	description: string;
	status: WorkerLiveStatus;
	lastRun: WorkerRunRecord | null;
};

export type WorkerDetail = WorkerListItem;

export type RecordFinishedRunInput = {
	workerId: string;
	trigger: WorkerRunTrigger;
	summary: string;
	log: WorkerLogLine[];
	status?: "succeeded" | "failed";
	error?: string | null;
};
