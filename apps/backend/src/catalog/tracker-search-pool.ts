export type DeadlineResult<T> = { done: true; value: T } | { done: false };

/** Resolve with the value if it settles within `ms`, otherwise report it as still running. */
export async function withDeadline<T>(
	promise: Promise<T>,
	ms: number | undefined,
): Promise<DeadlineResult<T>> {
	if (ms === undefined) {
		return { done: true, value: await promise };
	}
	let timer: ReturnType<typeof setTimeout> | undefined;
	const deadline = new Promise<DeadlineResult<T>>((resolve) => {
		timer = setTimeout(() => resolve({ done: false }), ms);
	});
	try {
		return await Promise.race([
			promise.then((value): DeadlineResult<T> => ({ done: true, value })),
			deadline,
		]);
	} finally {
		clearTimeout(timer);
	}
}

export type SearchPoolDeps = {
	/** How long a finished search answers repeated requests for the same key. */
	ttlMs: number;
	now: () => number;
};

/**
 * Shares tracker searches by key: a repeated request joins the running search
 * (e.g. the UI polling a tracker that missed the deadline) or reuses its
 * result for `ttlMs` once it has finished. `task` must not reject.
 */
export function createSearchPool<T>(deps: SearchPoolDeps) {
	const entries = new Map<
		string,
		{ promise: Promise<T>; settledAt: number | null }
	>();

	function prune(): void {
		const now = deps.now();
		for (const [key, entry] of entries) {
			if (entry.settledAt !== null && now - entry.settledAt >= deps.ttlMs) {
				entries.delete(key);
			}
		}
	}

	return {
		run(key: string, task: () => Promise<T>): Promise<T> {
			prune();
			const existing = entries.get(key);
			if (existing) {
				return existing.promise;
			}
			const entry: { promise: Promise<T>; settledAt: number | null } = {
				promise: task().finally(() => {
					entry.settledAt = deps.now();
				}),
				settledAt: null,
			};
			entries.set(key, entry);
			return entry.promise;
		},
	};
}
