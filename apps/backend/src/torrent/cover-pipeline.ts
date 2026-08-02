export type CoverPipelineDeps = {
	/** `undefined` = torrent row missing; `null` = present without cover. */
	getImageKey: (torrentId: string) => Promise<string | null | undefined>;
	resolveImageUrl: (torrentId: string) => Promise<string | null>;
	downloadBytes: (url: string) => Promise<Uint8Array | null>;
	optimize: (bytes: Uint8Array) => Promise<Uint8Array>;
	putCover: (torrentId: string, bytes: Uint8Array) => Promise<string>;
	persistImageKey: (torrentId: string, key: string) => Promise<void>;
	onWarn?: (message: string, context: Record<string, unknown>) => void;
	onError?: (message: string, context: Record<string, unknown>) => void;
};

const DEFAULT_CONCURRENCY = 3;

export async function processCoverFetch(
	torrentId: string,
	deps: CoverPipelineDeps,
): Promise<void> {
	try {
		const imageKey = await deps.getImageKey(torrentId);
		if (imageKey === undefined) {
			deps.onWarn?.("cover fetch: torrent row missing", { torrentId });
			return;
		}
		if (imageKey) {
			return;
		}

		const remoteUrl = (await deps.resolveImageUrl(torrentId))?.trim() ?? "";
		if (!remoteUrl) {
			return;
		}

		const bytes = await deps.downloadBytes(remoteUrl);
		if (!bytes || bytes.byteLength === 0) {
			return;
		}

		let webp: Uint8Array;
		try {
			webp = await deps.optimize(bytes);
		} catch (err) {
			deps.onWarn?.("cover fetch: image optimize failed", {
				torrentId,
				err: err instanceof Error ? err.message : String(err),
			});
			return;
		}

		const key = await deps.putCover(torrentId, webp);
		await deps.persistImageKey(torrentId, key);
	} catch (err) {
		deps.onError?.("cover fetch: unexpected failure", {
			torrentId,
			err: err instanceof Error ? err.message : String(err),
		});
	}
}

export function createCoverFetchQueue(
	deps: CoverPipelineDeps,
	options: { concurrency?: number } = {},
) {
	const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
	const inFlight = new Set<string>();
	const pending: string[] = [];
	let active = 0;
	const waiters: Array<() => void> = [];

	function notifyIdle() {
		if (active === 0 && pending.length === 0) {
			const ready = waiters.splice(0, waiters.length);
			for (const resolve of ready) {
				resolve();
			}
		}
	}

	function pump(): void {
		while (active < concurrency && pending.length > 0) {
			const id = pending.shift();
			if (!id) {
				break;
			}
			active += 1;
			void processCoverFetch(id, deps).finally(() => {
				inFlight.delete(id);
				active -= 1;
				pump();
				notifyIdle();
			});
		}
		notifyIdle();
	}

	return {
		enqueue(torrentIds: string[]): void {
			for (const id of torrentIds) {
				if (!id || inFlight.has(id)) {
					continue;
				}
				inFlight.add(id);
				pending.push(id);
			}
			pump();
		},
		whenIdle(): Promise<void> {
			if (active === 0 && pending.length === 0) {
				return Promise.resolve();
			}
			return new Promise((resolve) => {
				waiters.push(resolve);
			});
		},
	};
}
