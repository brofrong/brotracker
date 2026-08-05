import { describe, expect, test } from "bun:test";
import { checkTopicNow } from "./watch/check-topic-now";
import type { CheckResult, TitleWatchRecord } from "./watch/check-topic-now";
import { processWatchTask } from "./watch/process-watch-task";
import type { WatchTask } from "./watch/process-watch-task";
import { createTitleModule, type TitleDeps } from "./title";
import type { TitleRating, TmdbMeta } from "./title.types";

const stubRatings = (): TitleRating[] => [
	{ source: "tmdb", status: "unavailable" },
	{ source: "imdb", status: "unconfigured" },
	{ source: "kinopoisk", status: "unconfigured" },
];

const tvMeta = (): TmdbMeta => ({
	kind: "tv",
	poster: null,
	backdrop: null,
	name: "Test Show",
	year: 2024,
	overview: null,
	genres: [],
	cast: [],
	crew: [],
	similar: [],
	runtimeMinutes: null,
	status: "Returning Series",
	seasons: 1,
	voteAverage: 7,
	voteCount: 10,
});

function createWatchDeps(overrides: Partial<TitleDeps> = {}) {
	const store = new Map<string, TitleWatchRecord>();
	const tasks = new Map<string, WatchTask>();

	const deps: TitleDeps = {
		fetchTmdbMeta: async () => ({ status: "ok", meta: tvMeta() }),
		getRatings: async () => stubRatings(),
		searchTorrents: async () => ({
			status: "degraded",
			local: [],
			trackerError: "unavailable",
		}),
		listTaggedTorrents: async () => [],
		addFromTracker: async () => {},
		loadWatchByTopicUrl: async (topicUrl) => store.get(topicUrl) ?? null,
		loadWatchByTitleId: async (titleId) => {
			for (const record of store.values()) {
				if (record.titleId === titleId) {
					return record;
				}
			}
			return null;
		},
		saveWatch: async (record) => {
			store.set(record.topicUrl, record);
		},
		listQbTorrents: async () => [],
		getSeriesPath: async () => "/data/tv",
		fetchTorrentBytes: async () => new Uint8Array([1, 2, 3, 4]),
		fetchTopicMeta: async () => ({
			size: 4,
			registeredAt: "2024-01-01T00:00:00.000Z",
			torrentFileUrl: "https://rutracker.org/forum/dl.php?t=55",
		}),
		replaceInQb: async () => {},
		isCompletePack: () => false,
		now: () => "2026-08-02T14:00:00.000Z",
		// Mirrors the real bootstrap in title/index.ts: checkNow enqueues a
		// WatchTask and drains it through the same processWatchTask path the
		// nightly worker uses, backed here by an in-memory task store.
		enqueueWatchTask: async (input) => {
			const id = `task-${tasks.size + 1}`;
			const created: WatchTask = {
				id,
				topicUrl: input.topicUrl,
				titleId: input.titleId,
				trigger: input.trigger,
				status: "pending",
				error: null,
				createdAt: deps.now(),
				startedAt: null,
				finishedAt: null,
			};
			tasks.set(id, created);
			return created;
		},
		processWatchTask: (taskId) =>
			processWatchTask(
				{ taskId },
				{
					loadTask: async (id) => tasks.get(id) ?? null,
					saveTask: async (updated) => {
						tasks.set(updated.id, updated);
					},
					checkTopicNow: (input) =>
						checkTopicNow(input, {
							loadWatch: deps.loadWatchByTopicUrl,
							saveWatch: deps.saveWatch,
							fetchTorrentBytes: deps.fetchTorrentBytes,
							fetchTopicMeta: deps.fetchTopicMeta,
							replaceInQb: deps.replaceInQb,
							now: deps.now,
						}),
					now: deps.now,
				},
			),
		...overrides,
	};

	return { module: createTitleModule(deps), store, deps };
}

describe("title.setWatch", () => {
	test("creates manual tracking watch for topic already in qB", async () => {
		const { module, store } = createWatchDeps({
			listTaggedTorrents: async () => [
				{
					hash: "h1",
					progress: 0.5,
					stateKind: "downloading",
					stateLabel: "Загрузка",
					downloadSpeed: 1,
					etaSeconds: 10,
					tags: "brotracker:topic:55",
				},
			],
			searchTorrents: async () => ({
				status: "degraded",
				local: [
					{
						torrentId: "55",
						title: "Show",
						size: 100,
						seeds: 1,
						leeches: 0,
						torrentFileUrl: "https://rutracker.org/forum/dl.php?t=55",
						topicUrl: "https://rutracker.org/forum/viewtopic.php?t=55",
						hdr: null,
						resolution: "1080p",
						forumId: "1",
					},
				],
				trackerError: "unavailable",
			}),
		});

		await module.setWatch({
			id: "tmdb:tv:1",
			watch: "tracking",
		});

		const record = store.get(
			"https://rutracker.org/forum/viewtopic.php?t=55",
		);
		expect(record).toMatchObject({
			titleId: "tmdb:tv:1",
			watch: "tracking",
			source: "manual",
			qbHash: "h1",
		});
	});

	test("can pause an existing watch", async () => {
		const { module, store } = createWatchDeps();
		const topicUrl = "https://rutracker.org/forum/viewtopic.php?t=55";
		store.set(topicUrl, {
			topicUrl,
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

		await module.setWatch({ id: "tmdb:tv:1", watch: "paused" });
		expect(store.get(topicUrl)?.watch).toBe("paused");
	});
});

describe("title.checkNow", () => {
	test("returns failed CheckResult when tracker errors without throwing", async () => {
		const topicUrl = "https://rutracker.org/forum/viewtopic.php?t=55";
		const { module, store } = createWatchDeps({
			fetchTorrentBytes: async () => {
				throw new Error("boom");
			},
		});
		store.set(topicUrl, {
			topicUrl,
			titleId: "tmdb:tv:1",
			watch: "tracking",
			source: "manual",
			size: 1,
			registeredAt: null,
			contentHash: "x",
			qbHash: "h1",
			lastCheckedAt: null,
			lastChangedAt: null,
			lastError: null,
		});

		const result: CheckResult = await module.checkNow({ id: "tmdb:tv:1" });
		expect(result.status).toBe("failed");
		if (result.status === "failed") {
			expect(result.message).toBe("boom");
		}
		expect(store.get(topicUrl)?.lastError).toBe("boom");
	});

	test("enqueues a manual WatchTask and processes it via processWatchTask (not an ad-hoc check)", async () => {
		const topicUrl = "https://rutracker.org/forum/viewtopic.php?t=55";
		const enqueueCalls: { topicUrl: string; trigger: string }[] = [];
		const processedTaskIds: string[] = [];
		const { module, store, deps } = createWatchDeps();
		store.set(topicUrl, {
			topicUrl,
			titleId: "tmdb:tv:1",
			watch: "tracking",
			source: "manual",
			size: 4,
			registeredAt: "2024-01-01T00:00:00.000Z",
			contentHash: "9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a",
			qbHash: "h1",
			lastCheckedAt: null,
			lastChangedAt: null,
			lastError: null,
		});

		const originalEnqueue = deps.enqueueWatchTask;
		const originalProcess = deps.processWatchTask;
		deps.enqueueWatchTask = async (input) => {
			enqueueCalls.push({ topicUrl: input.topicUrl, trigger: input.trigger });
			return originalEnqueue(input);
		};
		deps.processWatchTask = async (taskId) => {
			processedTaskIds.push(taskId);
			return originalProcess(taskId);
		};

		const result = await module.checkNow({ id: "tmdb:tv:1" });

		expect(enqueueCalls).toEqual([{ topicUrl, trigger: "manual" }]);
		expect(processedTaskIds).toEqual(["task-1"]);
		expect(result.status).toBe("unchanged");
	});
});

describe("title.get watch", () => {
	test("links auto-followed topic watch onto the matching tv title", async () => {
		const topicUrl = "https://rutracker.org/forum/viewtopic.php?t=55";
		const { module, store } = createWatchDeps({
			listQbTorrents: async () => [
				{
					hash: "h1",
					name: "Test Show",
					savePath: "/data/tv",
					tags: "brotracker:topic:55",
					size: 100,
				},
			],
			listTaggedTorrents: async () => [
				{
					hash: "h1",
					progress: 0.5,
					stateKind: "downloading",
					stateLabel: "Загрузка",
					downloadSpeed: 1,
					etaSeconds: 10,
					tags: "brotracker:topic:55",
				},
			],
			searchTorrents: async () => ({
				status: "degraded",
				local: [
					{
						torrentId: "55",
						title: "Test Show",
						size: 100,
						seeds: 1,
						leeches: 0,
						torrentFileUrl: "https://rutracker.org/forum/dl.php?t=55",
						topicUrl,
						hdr: null,
						resolution: "1080p",
						forumId: "1",
					},
				],
				trackerError: "unavailable",
			}),
		});

		const title = await module.get({ id: "tmdb:tv:1" });
		expect(title.watch).toMatchObject({
			topicUrl,
			watch: "tracking",
		});
		expect(store.get(topicUrl)?.titleId).toBe("tmdb:tv:1");
	});

	test("exposes episode progress parsed from the current torrent name", async () => {
		const topicUrl = "https://rutracker.org/forum/viewtopic.php?t=55";
		const { store } = createWatchDeps();
		store.set(topicUrl, {
			topicUrl,
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

		const { module: moduleWithTorrents } = createWatchDeps({
			loadWatchByTopicUrl: async (url) => store.get(url) ?? null,
			loadWatchByTitleId: async (titleId) => {
				for (const record of store.values()) {
					if (record.titleId === titleId) {
						return record;
					}
				}
				return null;
			},
			saveWatch: async (record) => {
				store.set(record.topicUrl, record);
			},
			listQbTorrents: async () => [
				{
					hash: "h1",
					name: "Test Show 1-8 из 10",
					savePath: "/data/tv",
					tags: "brotracker:topic:55",
					size: 100,
				},
			],
		});

		const title = await moduleWithTorrents.get({ id: "tmdb:tv:1" });
		expect(title.watch?.progress).toEqual({ have: 8, total: 10 });
	});

	test("progress is null when the torrent name has no N/M pattern", async () => {
		const topicUrl = "https://rutracker.org/forum/viewtopic.php?t=55";
		const { store } = createWatchDeps();
		store.set(topicUrl, {
			topicUrl,
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

		const { module: moduleWithTorrents } = createWatchDeps({
			loadWatchByTopicUrl: async (url) => store.get(url) ?? null,
			loadWatchByTitleId: async (titleId) => {
				for (const record of store.values()) {
					if (record.titleId === titleId) {
						return record;
					}
				}
				return null;
			},
			saveWatch: async (record) => {
				store.set(record.topicUrl, record);
			},
			listQbTorrents: async () => [
				{
					hash: "h1",
					name: "Test Show S01 WEB-DL",
					savePath: "/data/tv",
					tags: "brotracker:topic:55",
					size: 100,
				},
			],
		});

		const title = await moduleWithTorrents.get({ id: "tmdb:tv:1" });
		expect(title.watch?.progress).toBeNull();
	});
});
