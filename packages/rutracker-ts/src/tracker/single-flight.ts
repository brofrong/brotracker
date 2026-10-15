import type { Result } from "neverthrow";

type Entry = {
	promise: Promise<Result<unknown, unknown>> | null;
	settledAt: number;
	value: Result<unknown, unknown> | null;
};

const entries = new WeakMap<object, Map<string, Entry>>();

/**
 * Run `task` once per (owner, key) at a time: concurrent callers share the
 * in-flight call instead of starting their own (e.g. one Byparr solve or one
 * login per tracker). A successful result is reused for `reuseMs` afterwards
 * so callers that hit the same expired session right after a refresh don't
 * refresh it again.
 */
export function sharedResult<T, E>(
	owner: object,
	key: string,
	task: () => Promise<Result<T, E>>,
	reuseMs = 0,
): Promise<Result<T, E>> {
	let byKey = entries.get(owner);
	if (!byKey) {
		byKey = new Map();
		entries.set(owner, byKey);
	}

	const entry = byKey.get(key);
	if (entry?.promise) {
		return entry.promise as Promise<Result<T, E>>;
	}
	if (entry?.value && Date.now() - entry.settledAt < reuseMs) {
		return Promise.resolve(entry.value as Result<T, E>);
	}

	const next: Entry = { promise: null, settledAt: 0, value: null };
	const promise = task().then(
		(value) => {
			next.promise = null;
			next.settledAt = Date.now();
			next.value = value.isOk() ? value : null;
			return value;
		},
		(error: unknown) => {
			next.promise = null;
			throw error;
		},
	);
	next.promise = promise;
	byKey.set(key, next);
	return promise;
}
