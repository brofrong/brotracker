import type {
	RecordFinishedRunInput,
	WorkerDefinition,
	WorkerDetail,
	WorkerListItem,
	WorkerLogLevel,
	WorkerRunRecord,
	WorkerRunStore,
} from "./workers.types";

export type WorkersDeps = {
	store: WorkerRunStore;
	definitions: WorkerDefinition[];
	now: () => Date;
	id: () => string;
	retainRuns: number;
};

export function createWorkers(deps: WorkersDeps) {
	const byId = new Map(deps.definitions.map((d) => [d.id, d]));

	function requireDefinition(workerId: string): WorkerDefinition {
		const definition = byId.get(workerId);
		if (!definition) {
			throw new Error(`Unknown worker: ${workerId}`);
		}
		return definition;
	}

	async function assertNotRunning(workerId: string): Promise<void> {
		const running = await deps.store.findRunning(workerId);
		if (running) {
			throw new Error(
				`Worker ${workerId} already running (run ${running.id})`,
			);
		}
	}

	async function toListItem(definition: WorkerDefinition): Promise<WorkerListItem> {
		const [running, recent] = await Promise.all([
			deps.store.findRunning(definition.id),
			deps.store.listByWorker(definition.id, 1),
		]);
		const lastRun = recent[0] ?? null;
		return {
			id: definition.id,
			name: definition.name,
			description: definition.description,
			status: running ? "running" : "idle",
			lastRun,
		};
	}

	async function prune(workerId: string): Promise<void> {
		await deps.store.pruneOlderThan(workerId, deps.retainRuns);
	}

	return {
		async list(): Promise<WorkerListItem[]> {
			return Promise.all(deps.definitions.map(toListItem));
		},

		async get(id: string): Promise<WorkerDetail | null> {
			const definition = byId.get(id);
			if (!definition) {
				return null;
			}
			return toListItem(definition);
		},

		async listRuns(
			workerId: string,
			limit = 50,
		): Promise<WorkerRunRecord[]> {
			requireDefinition(workerId);
			return deps.store.listByWorker(workerId, limit);
		},

		async getRun(runId: string): Promise<WorkerRunRecord | null> {
			return deps.store.get(runId);
		},

		async run(workerId: string): Promise<WorkerRunRecord> {
			const definition = requireDefinition(workerId);
			await assertNotRunning(workerId);

			const startedAt = deps.now();
			const record = await deps.store.insertRunning({
				id: deps.id(),
				workerId,
				trigger: "manual",
				startedAt,
			});

			const pending: Promise<void>[] = [];
			const log = (level: WorkerLogLevel, message: string) => {
				const p = deps.store.appendLog(record.id, {
					ts: deps.now().toISOString(),
					level,
					message,
				});
				pending.push(p);
				return p;
			};

			try {
				const { summary } = await definition.execute({ log });
				await Promise.allSettled(pending);
				const finished = await deps.store.finish(record.id, {
					status: "succeeded",
					finishedAt: deps.now(),
					summary,
					error: null,
				});
				await prune(workerId);
				return finished;
			} catch (err) {
				await Promise.allSettled(pending);
				const message =
					err instanceof Error ? err.message : String(err);
				const finished = await deps.store.finish(record.id, {
					status: "failed",
					finishedAt: deps.now(),
					summary: null,
					error: message,
				});
				await prune(workerId);
				return finished;
			}
		},

		async recordFinishedRun(
			input: RecordFinishedRunInput,
		): Promise<WorkerRunRecord> {
			requireDefinition(input.workerId);
			await assertNotRunning(input.workerId);

			const startedAt = deps.now();
			const record = await deps.store.insertRunning({
				id: deps.id(),
				workerId: input.workerId,
				trigger: input.trigger,
				startedAt,
			});

			for (const line of input.log) {
				await deps.store.appendLog(record.id, line);
			}

			const status = input.status ?? "succeeded";
			const finished = await deps.store.finish(record.id, {
				status,
				finishedAt: deps.now(),
				summary: input.summary,
				error: status === "failed" ? (input.error ?? null) : null,
			});
			await prune(input.workerId);
			return finished;
		},
	};
}
