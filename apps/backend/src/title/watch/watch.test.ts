import { describe, expect, test } from "bun:test";
import type { TitleWatchRecord } from "./check-topic-now";
import type { WatchTask } from "./process-watch-task";
import type { SyncQbTorrent } from "./sync-watches-from-qb";
import type { TitleWatchEvent } from "./title-watch-event";
import { createWatch } from "./watch";
import type { WatchDeps, WatchStore, WatchTransfers, WatchTracker } from "./watch.types";

const NOW = "2026-08-05T12:00:00.000Z";
const TOPIC_URL = "https://rutracker.org/forum/viewtopic.php?t=100";

function createInMemoryDeps(options: {
	qbTorrents?: SyncQbTorrent[];
	seriesPath?: string | null;
	torrentBytes?: Uint8Array;
	topicMeta?: {
		size: number;
		registeredAt: string | null;
		torrentFileUrl: string;
	};
	isCompletePack?: (name: string) => boolean;
} = {}): {
	deps: WatchDeps;
	watches: Map<string, TitleWatchRecord>;
	tasks: Map<string, WatchTask>;
	events: TitleWatchEvent[];
	replaceCalls: { topicId: string }[];
} {
	const watches = new Map<string, TitleWatchRecord>();
	const tasks = new Map<string, WatchTask>();
	const events: TitleWatchEvent[] = [];
	const replaceCalls: { topicId: string }[] = [];

	const store: WatchStore = {
		loadByTopicUrl: async (topicUrl) => watches.get(topicUrl) ?? null,
		loadByTitleId: async (titleId) => {
			for (const record of watches.values()) {
				if (record.titleId === titleId) {
					return record;
				}
			}
			return null;
		},
		save: async (record) => {
			watches.set(record.topicUrl, record);
		},
		listTracking: async () =>
			[...watches.values()]
				.filter((w) => w.watch === "tracking")
				.map((w) => ({ topicUrl: w.topicUrl, titleId: w.titleId })),
		appendEvent: async (event) => {
			events.push(event);
		},
		listRecentEvents: async (limit) =>
			[...events]
				.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
				.slice(0, limit),
		createTask: async (input) => {
			const task: WatchTask = {
				id: `task-${tasks.size + 1}`,
				topicUrl: input.topicUrl,
				titleId: input.titleId,
				trigger: input.trigger,
				status: "pending",
				error: null,
				createdAt: NOW,
				startedAt: null,
				finishedAt: null,
			};
			tasks.set(task.id, task);
			return task;
		},
		loadTask: async (id) => tasks.get(id) ?? null,
		saveTask: async (task) => {
			tasks.set(task.id, task);
		},
		hasPending: async (topicUrl) =>
			[...tasks.values()].some(
				(t) => t.topicUrl === topicUrl && t.status === "pending",
			),
		listPendingIds: async () =>
			[...tasks.values()]
				.filter((t) => t.status === "pending")
				.map((t) => t.id),
	};

	const transfers: WatchTransfers = {
		listQbTorrents: async () => options.qbTorrents ?? [],
		getSeriesPath: async () =>
			options.seriesPath === undefined ? "/data/tv" : options.seriesPath,
		replaceInQb: async (input) => {
			replaceCalls.push({ topicId: input.topicId });
		},
	};

	const tracker: WatchTracker = {
		fetchTorrentBytes: async () =>
			options.torrentBytes ?? new Uint8Array([1, 2, 3, 4]),
		fetchTopicMeta: async () =>
			options.topicMeta ?? {
				size: 4,
				registeredAt: "2024-01-01T00:00:00.000Z",
				torrentFileUrl: "https://rutracker.org/forum/dl.php?t=100",
			},
	};

	return {
		deps: {
			store,
			transfers,
			tracker,
			isCompletePack: options.isCompletePack ?? (() => false),
			now: () => NOW,
		},
		watches,
		tasks,
		events,
		replaceCalls,
	};
}

describe("createWatch", () => {
	test("syncFromQb upserts a tracking TitleWatch for seriesPath torrents with topic tags", async () => {
		const { deps, watches } = createInMemoryDeps({
			qbTorrents: [
				{
					hash: "h1",
					name: "Show S01",
					savePath: "/data/tv/Show",
					tags: "brotracker:topic:100",
					size: 1000,
				},
				{
					hash: "h2",
					name: "Movie",
					savePath: "/data/films",
					tags: "brotracker:topic:200",
					size: 2000,
				},
			],
		});
		const watch = createWatch(deps);

		const result = await watch.syncFromQb();

		expect(result.upserted).toBe(1);
		expect(await watch.loadByTopicUrl(TOPIC_URL)).toMatchObject({
			topicUrl: TOPIC_URL,
			watch: "tracking",
			source: "auto-qb",
			qbHash: "h1",
			size: 1000,
		});
		expect(
			await watch.loadByTopicUrl(
				"https://rutracker.org/forum/viewtopic.php?t=200",
			),
		).toBeNull();
		expect(watches.size).toBe(1);
	});

	test("processTask drains a pending WatchTask through the bound check path", async () => {
		const { deps, watches, tasks, replaceCalls } = createInMemoryDeps();
		watches.set(TOPIC_URL, {
			topicUrl: TOPIC_URL,
			titleId: "tmdb:tv:1",
			watch: "tracking",
			source: "manual",
			size: 1,
			registeredAt: null,
			contentHash: null,
			qbHash: "h1",
			lastCheckedAt: null,
			lastChangedAt: null,
			lastError: null,
		});
		tasks.set("task-1", {
			id: "task-1",
			topicUrl: TOPIC_URL,
			titleId: "tmdb:tv:1",
			trigger: "manual",
			status: "pending",
			error: null,
			createdAt: NOW,
			startedAt: null,
			finishedAt: null,
		});

		const watch = createWatch(deps);
		const outcome = await watch.processTask("task-1");

		expect(outcome.outcome).toBe("processed");
		if (outcome.outcome !== "processed") {
			throw new Error("expected processed");
		}
		expect(outcome.checkResult.status).toBe("unchanged");
		expect(outcome.task.status).toBe("succeeded");
		expect(outcome.task.startedAt).toBe(NOW);
		expect(outcome.task.finishedAt).toBe(NOW);
		expect(replaceCalls).toEqual([]);
		expect(watches.get(TOPIC_URL)?.contentHash).toBeTruthy();
		expect(watches.get(TOPIC_URL)?.lastCheckedAt).toBe(NOW);
		expect(watches.get(TOPIC_URL)?.lastError).toBeNull();
	});

	test("enqueueNightly creates pending WatchTasks for tracking watches", async () => {
		const { deps, watches } = createInMemoryDeps();
		watches.set(TOPIC_URL, {
			topicUrl: TOPIC_URL,
			titleId: "tmdb:tv:1",
			watch: "tracking",
			source: "auto-qb",
			size: 1000,
			registeredAt: null,
			contentHash: null,
			qbHash: "h1",
			lastCheckedAt: null,
			lastChangedAt: null,
			lastError: null,
		});
		watches.set("https://rutracker.org/forum/viewtopic.php?t=200", {
			topicUrl: "https://rutracker.org/forum/viewtopic.php?t=200",
			titleId: null,
			watch: "paused",
			source: "manual",
			size: 1,
			registeredAt: null,
			contentHash: null,
			qbHash: "h2",
			lastCheckedAt: null,
			lastChangedAt: null,
			lastError: null,
		});

		const watch = createWatch(deps);
		const { enqueued } = await watch.enqueueNightly();

		expect(enqueued).toBe(1);
		const pendingIds = await watch.listPendingTaskIds();
		expect(pendingIds).toHaveLength(1);
		const task = await deps.store.loadTask(pendingIds[0]!);
		expect(task).toMatchObject({
			topicUrl: TOPIC_URL,
			titleId: "tmdb:tv:1",
			trigger: "nightly",
			status: "pending",
		});
	});
});
