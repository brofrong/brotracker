import type {
	CheckResult,
	RecordWatchEventInput,
	TitleWatchRecord,
	TopicMeta,
} from "./check-topic-now";
import type {
	ProcessWatchTaskResult,
	WatchTask,
	WatchTaskTrigger,
} from "./process-watch-task";
import type { SyncQbTorrent } from "./sync-watches-from-qb";
import type { TitleWatchEvent } from "./title-watch-event";

export type WatchStore = {
	loadByTopicUrl: (topicUrl: string) => Promise<TitleWatchRecord | null>;
	loadByTitleId: (titleId: string) => Promise<TitleWatchRecord | null>;
	save: (record: TitleWatchRecord) => Promise<void>;
	listTracking: () => Promise<
		{ topicUrl: string; titleId: string | null }[]
	>;
	appendEvent: (event: TitleWatchEvent) => Promise<void>;
	listRecentEvents: (limit: number) => Promise<TitleWatchEvent[]>;
	createTask: (input: {
		topicUrl: string;
		titleId: string | null;
		trigger: WatchTaskTrigger;
	}) => Promise<WatchTask>;
	loadTask: (id: string) => Promise<WatchTask | null>;
	saveTask: (task: WatchTask) => Promise<void>;
	hasPending: (topicUrl: string) => Promise<boolean>;
	listPendingIds: () => Promise<string[]>;
};

export type WatchTransfers = {
	listQbTorrents: () => Promise<SyncQbTorrent[]>;
	replaceInQb: (input: {
		topicId: string;
		torrentBytes: Uint8Array;
		tags: string[];
	}) => Promise<void>;
	getSeriesPath: () => Promise<string | null>;
};

export type WatchTracker = {
	fetchTorrentBytes: (torrentFileUrl: string) => Promise<Uint8Array>;
	fetchTopicMeta: (topicUrl: string) => Promise<TopicMeta>;
};

export type WatchDeps = {
	store: WatchStore;
	transfers: WatchTransfers;
	tracker: WatchTracker;
	isCompletePack: (torrentName: string) => boolean;
	now: () => string;
};

export type Watch = {
	/** Explicit sync from qb tags/paths — not called from Title.get (step 3). */
	syncFromQb: () => Promise<{ upserted: number }>;
	processTask: (taskId: string) => Promise<ProcessWatchTaskResult>;
	checkTopicNow: (input: { topicUrl: string }) => Promise<CheckResult>;
	enqueueTask: (input: {
		topicUrl: string;
		titleId: string | null;
		trigger: WatchTaskTrigger;
	}) => Promise<WatchTask>;
	enqueueNightly: () => Promise<{ enqueued: number }>;
	listPendingTaskIds: () => Promise<string[]>;
	loadByTopicUrl: (topicUrl: string) => Promise<TitleWatchRecord | null>;
	loadByTitleId: (titleId: string) => Promise<TitleWatchRecord | null>;
	save: (record: TitleWatchRecord) => Promise<void>;
	isCompletePack: (torrentName: string) => boolean;
	now: () => string;
	listRecentEvents: (limit: number) => Promise<TitleWatchEvent[]>;
	/** Maps feed inputs into store.appendEvent (id + createdAt stamped here). */
	recordEvent: (event: RecordWatchEventInput) => Promise<void>;
};

export type {
	CheckResult,
	RecordWatchEventInput,
	TitleWatchRecord,
	TopicMeta,
} from "./check-topic-now";
export type {
	ProcessWatchTaskResult,
	WatchTask,
	WatchTaskTrigger,
} from "./process-watch-task";
export type { SyncQbTorrent } from "./sync-watches-from-qb";
export type { TitleWatchEvent, TitleWatchEventKind } from "./title-watch-event";
