import type { WorkerRunRecord, WorkerRunStore } from "./workers.types";

function compareNewestFirst(a: WorkerRunRecord, b: WorkerRunRecord): number {
	const aMs = a.startedAt.getTime();
	const bMs = b.startedAt.getTime();
	if (aMs === bMs) {
		return 0;
	}
	return aMs > bMs ? -1 : 1;
}

export function createMemoryWorkerRunStore(): WorkerRunStore {
	const runs = new Map<string, WorkerRunRecord>();

	function requireRun(id: string): WorkerRunRecord {
		const run = runs.get(id);
		if (!run) {
			throw new Error(`Worker run not found: ${id}`);
		}
		return run;
	}

	return {
		async insertRunning(input) {
			for (const run of runs.values()) {
				if (run.workerId === input.workerId && run.status === "running") {
					throw new Error(
						`Worker ${input.workerId} already running (run ${run.id})`,
					);
				}
			}

			const record: WorkerRunRecord = {
				id: input.id,
				workerId: input.workerId,
				trigger: input.trigger,
				status: "running",
				startedAt: input.startedAt,
				finishedAt: null,
				summary: null,
				error: null,
				log: [],
			};
			runs.set(record.id, record);
			return record;
		},

		async appendLog(id, line) {
			requireRun(id).log.push(line);
		},

		async finish(id, result) {
			const run = requireRun(id);
			run.status = result.status;
			run.finishedAt = result.finishedAt;
			run.summary = result.summary;
			run.error = result.error;
			return run;
		},

		async findRunning(workerId) {
			for (const run of runs.values()) {
				if (run.workerId === workerId && run.status === "running") {
					return run;
				}
			}
			return null;
		},

		async failAllRunning(input) {
			for (const run of runs.values()) {
				if (run.status === "running") {
					run.status = "failed";
					run.finishedAt = input.finishedAt;
					run.summary = null;
					run.error = input.error;
				}
			}
		},

		async listByWorker(workerId, limit) {
			return [...runs.values()]
				.filter((run) => run.workerId === workerId)
				.sort(compareNewestFirst)
				.slice(0, limit);
		},

		async get(id) {
			return runs.get(id) ?? null;
		},

		async pruneOlderThan(workerId, keep) {
			const idsToKeep = new Set(
				[...runs.values()]
					.filter((run) => run.workerId === workerId)
					.sort(compareNewestFirst)
					.slice(0, keep)
					.map((run) => run.id),
			);

			for (const [id, run] of runs) {
				if (run.workerId === workerId && !idsToKeep.has(id)) {
					runs.delete(id);
				}
			}
		},
	};
}
