import type { CheckResult } from "./check-topic-now";

export type WatchTaskTrigger = "nightly" | "manual";
export type WatchTaskStatus = "pending" | "running" | "succeeded" | "failed";

export type WatchTask = {
	id: string;
	topicUrl: string;
	titleId: string | null;
	trigger: WatchTaskTrigger;
	status: WatchTaskStatus;
	error: string | null;
	createdAt: string;
	startedAt: string | null;
	finishedAt: string | null;
};

export type ProcessWatchTaskDeps = {
	loadTask: (id: string) => Promise<WatchTask | null>;
	saveTask: (task: WatchTask) => Promise<void>;
	checkTopicNow: (input: { topicUrl: string }) => Promise<CheckResult>;
	now: () => string;
};

export type ProcessWatchTaskResult =
	| { outcome: "not_found" }
	| { outcome: "skipped"; task: WatchTask }
	| { outcome: "processed"; task: WatchTask; checkResult: CheckResult };

/**
 * Loads a pending WatchTask, runs the shared checkTopicNow path, and
 * transitions status pending -> running -> succeeded | failed.
 *
 * Non-pending tasks are left untouched (outcome "skipped") so calling this
 * twice for the same task id is safe (idempotent), e.g. if the nightly
 * worker and a manual checkNow race on the same row.
 */
export async function processWatchTask(
	input: { taskId: string },
	deps: ProcessWatchTaskDeps,
): Promise<ProcessWatchTaskResult> {
	const task = await deps.loadTask(input.taskId);
	if (!task) {
		return { outcome: "not_found" };
	}

	if (task.status !== "pending") {
		return { outcome: "skipped", task };
	}

	const running: WatchTask = {
		...task,
		status: "running",
		startedAt: deps.now(),
	};
	await deps.saveTask(running);

	try {
		const checkResult = await deps.checkTopicNow({ topicUrl: task.topicUrl });
		const finished: WatchTask =
			checkResult.status === "failed"
				? {
						...running,
						status: "failed",
						error: checkResult.message,
						finishedAt: deps.now(),
					}
				: {
						...running,
						status: "succeeded",
						error: null,
						finishedAt: deps.now(),
					};
		await deps.saveTask(finished);
		return { outcome: "processed", task: finished, checkResult };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		const failed: WatchTask = {
			...running,
			status: "failed",
			error: message,
			finishedAt: deps.now(),
		};
		await deps.saveTask(failed);
		return {
			outcome: "processed",
			task: failed,
			checkResult: { status: "failed", checkedAt: deps.now(), message },
		};
	}
}
