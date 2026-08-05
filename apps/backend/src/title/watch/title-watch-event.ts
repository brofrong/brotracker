export type TitleWatchEventKind =
	| "torrent-updated"
	| "progress-changed"
	| "completed"
	| "check-failed";

export type TitleWatchEvent = {
	id: string;
	/** May be null if the topic isn't linked to a Title yet; feed skips these. */
	titleId: string | null;
	topicUrl: string;
	kind: TitleWatchEventKind;
	message: string | null;
	previousSize: number | null;
	newSize: number | null;
	createdAt: string;
};

export type WatchEventStore = {
	append: (event: TitleWatchEvent) => Promise<void>;
	/** Newest first, capped at `limit`. */
	listRecent: (limit: number) => Promise<TitleWatchEvent[]>;
};

function compareNewestFirst(a: TitleWatchEvent, b: TitleWatchEvent): number {
	if (a.createdAt === b.createdAt) {
		return 0;
	}
	return a.createdAt > b.createdAt ? -1 : 1;
}

/** Reference implementation used by tests and as a safe default when no persistence is wired. */
export function createInMemoryWatchEventStore(): WatchEventStore {
	const events: TitleWatchEvent[] = [];

	return {
		async append(event) {
			events.push(event);
		},
		async listRecent(limit) {
			return [...events].sort(compareNewestFirst).slice(0, limit);
		},
	};
}
