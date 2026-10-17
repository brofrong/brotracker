import { describe, expect, test } from "bun:test";
import { createTitleModule, type TitleDeps } from "./title";
import type { TitleRating, TmdbMeta } from "./title.types";
import type {
	CheckResult,
	RecordWatchEventInput,
	TitleWatchRecord,
} from "./watch/check-topic-now";
import { checkTopicNow } from "./watch/check-topic-now";
import type { WatchTask } from "./watch/process-watch-task";
import { processWatchTask } from "./watch/process-watch-task";

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
	originalName: "Test Show",
	alternativeNames: [],
	voteAverage: 7,
	voteCount: 10,
});

type CheckAdapters = {
	fetchTorrentBytes: () => Promise<Uint8Array>;
	fetchTopicMeta: () => Promise<{
		size: number;
		registeredAt: string | null;
		torrentFileUrl: string;
	}>;
	replaceInQb: () => Promise<void>;
};

function createWatchDeps(overrides: Partial<TitleDeps> = {}) {
	const store = new Map<string, TitleWatchRecord>();
	const tasks = new Map<string, WatchTask>();
	const events: RecordWatchEventInput[] = [];

	const checkAdapters: CheckAdapters = {
		fetchTorrentBytes: async () => new Uint8Array([1, 2, 3, 4]),
		fetchTopicMeta: async () => ({
			size: 4,
			registeredAt: "2024-01-01T00:00:00.000Z",
			torrentFileUrl: "https://rutracker.org/forum/dl.php?t=55",
		}),
		replaceInQb: async () => {},
	};

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
			// upsert on id, like the real repository
			for (const [key, value] of store) {
				if (value.id === record.id) {
					store.delete(key);
				}
			}
			store.set(record.topicUrl ?? record.id, record);
		},
		deleteWatch: async (id) => {
			for (const [key, value] of store) {
				if (value.id === id) {
					store.delete(key);
				}
			}
		},
		recordEvent: async (event) => {
			events.push(event);
		},
		listQbTorrents: async () => [],
		now: () => "2026-08-02T14:00:00.000Z",
		// Mirrors the real bootstrap: checkNow enqueues a WatchTask and drains
		// it through processWatchTask (same path as the nightly worker).
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
							fetchTorrentBytes: checkAdapters.fetchTorrentBytes,
							fetchTopicMeta: checkAdapters.fetchTopicMeta,
							replaceInQb: checkAdapters.replaceInQb,
							now: deps.now,
						}),
					now: deps.now,
				},
			),
		upsertLink: async () => {},
		loadAllLinks: async () => ({}),
		listTitledWatches: async () => [],
		...overrides,
	};

	return {
		module: createTitleModule(deps),
		store,
		deps,
		checkAdapters,
		events,
	};
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

		const record = store.get("https://rutracker.org/forum/viewtopic.php?t=55");
		expect(record).toMatchObject({
			titleId: "tmdb:tv:1",
			kind: "tv",
			watch: "tracking",
			source: "manual",
			qbHash: "h1",
			createdAt: "2026-08-02T14:00:00.000Z",
		});
		expect(record?.id).toMatch(/^[0-9a-f-]{36}$/u);
	});

	test("can pause an existing watch", async () => {
		const { module, store } = createWatchDeps();
		const topicUrl = "https://rutracker.org/forum/viewtopic.php?t=55";
		store.set(topicUrl, {
			id: "watch-1",
			topicUrl,
			titleId: "tmdb:tv:1",
			kind: "tv",
			watch: "tracking",
			source: "manual",
			season: null,
			titleName: null,
			poster: null,
			year: null,
			size: 1,
			registeredAt: null,
			contentHash: null,
			qbHash: "h1",
			lastCheckedAt: null,
			lastChangedAt: null,
			lastError: null,
			waitingOutcome: null,
			waitingOutcomeDetail: null,
			createdAt: "2026-08-01T00:00:00.000Z",
		});

		await module.setWatch({ id: "tmdb:tv:1", watch: "paused" });
		expect(store.get(topicUrl)?.watch).toBe("paused");
		expect(store.get(topicUrl)?.id).toBe("watch-1");
	});
});

describe("title.add", () => {
	test("creates a tv watch with its own id for a new topic", async () => {
		const { module, store } = createWatchDeps();
		const topicUrl = "https://rutracker.org/forum/viewtopic.php?t=77";

		await module.add({
			torrentFileUrl: "https://rutracker.org/forum/dl.php?t=77",
			kind: "tv",
			topicUrl,
			titleId: "tmdb:tv:1",
		});

		const record = store.get(topicUrl);
		expect(record).toMatchObject({
			topicUrl,
			titleId: "tmdb:tv:1",
			kind: "tv",
			watch: "tracking",
			source: "manual",
			waitingOutcome: null,
			createdAt: "2026-08-02T14:00:00.000Z",
		});
		expect(record?.id).toMatch(/^[0-9a-f-]{36}$/u);
	});
});

describe("title.checkNow", () => {
	test("fails without enqueueing when the watch has no topic yet", async () => {
		const { module, store, deps } = createWatchDeps();
		let enqueued = 0;
		const enqueue = deps.enqueueWatchTask;
		deps.enqueueWatchTask = async (input) => {
			enqueued += 1;
			return enqueue(input);
		};
		store.set("waiting-1", {
			id: "waiting-1",
			topicUrl: null,
			titleId: "tmdb:tv:1",
			kind: "tv",
			watch: "waiting",
			source: "manual",
			season: 2,
			titleName: "Show",
			poster: null,
			year: 2025,
			size: null,
			registeredAt: null,
			contentHash: null,
			qbHash: null,
			lastCheckedAt: null,
			lastChangedAt: null,
			lastError: null,
			waitingOutcome: "no-releases",
			waitingOutcomeDetail: null,
			createdAt: "2026-08-01T00:00:00.000Z",
		});

		const result = await module.checkNow({ id: "tmdb:tv:1" });

		expect(result.status).toBe("failed");
		expect(enqueued).toBe(0);
	});

	test("returns failed CheckResult when tracker errors without throwing", async () => {
		const topicUrl = "https://rutracker.org/forum/viewtopic.php?t=55";
		const { module, store, checkAdapters } = createWatchDeps();
		checkAdapters.fetchTorrentBytes = async () => {
			throw new Error("boom");
		};
		store.set(topicUrl, {
			id: "watch-2",
			topicUrl,
			titleId: "tmdb:tv:1",
			kind: "tv",
			watch: "tracking",
			source: "manual",
			season: null,
			titleName: null,
			poster: null,
			year: null,
			size: 1,
			registeredAt: null,
			contentHash: "x",
			qbHash: "h1",
			lastCheckedAt: null,
			lastChangedAt: null,
			lastError: null,
			waitingOutcome: null,
			waitingOutcomeDetail: null,
			createdAt: "2026-08-01T00:00:00.000Z",
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
			id: "watch-3",
			topicUrl,
			titleId: "tmdb:tv:1",
			kind: "tv",
			watch: "tracking",
			source: "manual",
			season: null,
			titleName: null,
			poster: null,
			year: null,
			size: 4,
			registeredAt: "2024-01-01T00:00:00.000Z",
			contentHash:
				"9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a",
			qbHash: "h1",
			lastCheckedAt: null,
			lastChangedAt: null,
			lastError: null,
			waitingOutcome: null,
			waitingOutcomeDetail: null,
			createdAt: "2026-08-01T00:00:00.000Z",
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
		// Nightly / explicit syncFromQb already created the auto-qb watch;
		// get() only reads + links — it must not sync from qb.
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
		store.set(topicUrl, {
			id: "watch-4",
			topicUrl,
			titleId: null,
			kind: "tv",
			watch: "tracking",
			source: "auto-qb",
			season: null,
			titleName: null,
			poster: null,
			year: null,
			size: 100,
			registeredAt: null,
			contentHash: null,
			qbHash: "h1",
			lastCheckedAt: null,
			lastChangedAt: null,
			lastError: null,
			waitingOutcome: null,
			waitingOutcomeDetail: null,
			createdAt: "2026-08-01T00:00:00.000Z",
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
			id: "watch-5",
			topicUrl,
			titleId: "tmdb:tv:1",
			kind: "tv",
			watch: "tracking",
			source: "manual",
			season: null,
			titleName: null,
			poster: null,
			year: null,
			size: 1,
			registeredAt: null,
			contentHash: null,
			qbHash: "h1",
			lastCheckedAt: null,
			lastChangedAt: null,
			lastError: null,
			waitingOutcome: null,
			waitingOutcomeDetail: null,
			createdAt: "2026-08-01T00:00:00.000Z",
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
				// upsert on id, like the real repository
				for (const [key, value] of store) {
					if (value.id === record.id) {
						store.delete(key);
					}
				}
				store.set(record.topicUrl ?? record.id, record);
			},
			listQbTorrents: async () => [
				{
					hash: "h1",
					name: "Show. 1-8 из 10. WEB-DL 1080p",
					savePath: "/data/tv",
					tags: "brotracker:topic:55",
					size: 1,
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
			id: "watch-6",
			topicUrl,
			titleId: "tmdb:tv:1",
			kind: "tv",
			watch: "tracking",
			source: "manual",
			season: null,
			titleName: null,
			poster: null,
			year: null,
			size: 1,
			registeredAt: null,
			contentHash: null,
			qbHash: "h1",
			lastCheckedAt: null,
			lastChangedAt: null,
			lastError: null,
			waitingOutcome: null,
			waitingOutcomeDetail: null,
			createdAt: "2026-08-01T00:00:00.000Z",
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
				// upsert on id, like the real repository
				for (const [key, value] of store) {
					if (value.id === record.id) {
						store.delete(key);
					}
				}
				store.set(record.topicUrl ?? record.id, record);
			},
			listQbTorrents: async () => [
				{
					hash: "h1",
					name: "Show S01 WEB-DL 1080p",
					savePath: "/data/tv",
					tags: "brotracker:topic:55",
					size: 1,
				},
			],
		});

		const title = await moduleWithTorrents.get({ id: "tmdb:tv:1" });
		expect(title.watch?.progress).toBeNull();
	});
});

const filmMeta = (): TmdbMeta => ({
	...tvMeta(),
	kind: "films",
	name: "Одиссея",
	poster: "film.jpg",
	year: 2026,
	status: null,
	seasons: null,
	originalName: "The Odyssey",
});

const waitingWatch = (
	overrides: Partial<TitleWatchRecord> = {},
): TitleWatchRecord => ({
	id: "waiting-1",
	topicUrl: null,
	titleId: "tmdb:films:7",
	kind: "films",
	watch: "waiting",
	source: "manual",
	season: null,
	titleName: "Одиссея",
	poster: "film.jpg",
	year: 2026,
	size: null,
	registeredAt: null,
	contentHash: null,
	qbHash: null,
	lastCheckedAt: "2026-08-01T10:00:00.000Z",
	lastChangedAt: null,
	lastError: null,
	waitingOutcome: "no-voice",
	waitingOutcomeDetail: null,
	createdAt: "2026-08-01T00:00:00.000Z",
	...overrides,
});

describe("title.get watch for films", () => {
	test("a film with a waiting watch returns it", async () => {
		const { module, store } = createWatchDeps({
			fetchTmdbMeta: async () => ({ status: "ok", meta: filmMeta() }),
		});
		store.set("waiting-1", waitingWatch());

		const title = await module.get({ id: "tmdb:films:7" });

		expect(title.watch?.watch).toBe("waiting");
		expect(title.watch?.id).toBe("waiting-1");
	});

	test("backfills name, poster and year on a loaded watch", async () => {
		const { module, store } = createWatchDeps({
			fetchTmdbMeta: async () => ({ status: "ok", meta: filmMeta() }),
		});
		store.set(
			"waiting-1",
			waitingWatch({ titleName: null, poster: null, year: null }),
		);

		await module.get({ id: "tmdb:films:7" });

		expect(store.get("waiting-1")).toMatchObject({
			titleName: "Одиссея",
			poster: "film.jpg",
			year: 2026,
		});
	});

	test("a film without a watch is never auto-linked", async () => {
		let searched = 0;
		const { module } = createWatchDeps({
			fetchTmdbMeta: async () => ({ status: "ok", meta: filmMeta() }),
			searchTorrents: async () => {
				searched += 1;
				return { status: "degraded", local: [], trackerError: "unavailable" };
			},
		});

		const title = await module.get({ id: "tmdb:films:7" });

		expect(title.watch).toBeNull();
		expect(searched).toBe(0);
	});
});

describe("title.add onto a waiting watch", () => {
	const topicUrl = "https://rutracker.org/forum/viewtopic.php?t=88";

	test("a waiting film starts downloading with the topic", async () => {
		const { module, store, events } = createWatchDeps();
		store.set("waiting-1", waitingWatch());

		await module.add({
			torrentFileUrl: "https://rutracker.org/forum/dl.php?t=88",
			kind: "films",
			topicUrl,
			titleId: "tmdb:films:7",
		});

		expect([...store.values()]).toHaveLength(1);
		expect(store.get(topicUrl)).toMatchObject({
			id: "waiting-1",
			topicUrl,
			kind: "films",
			watch: "downloading",
			source: "manual",
			lastChangedAt: "2026-08-02T14:00:00.000Z",
			waitingOutcome: null,
			lastError: null,
		});
		expect(events).toEqual([
			{
				titleId: "tmdb:films:7",
				topicUrl,
				kind: "download-started",
				message: null,
			},
		]);
	});

	test("a waiting series starts tracking with the topic", async () => {
		const { module, store, events } = createWatchDeps();
		store.set(
			"waiting-1",
			waitingWatch({ titleId: "tmdb:tv:1", kind: "tv", season: 2 }),
		);

		await module.add({
			torrentFileUrl: "https://rutracker.org/forum/dl.php?t=88",
			kind: "tv",
			topicUrl,
			titleId: "tmdb:tv:1",
		});

		expect([...store.values()]).toHaveLength(1);
		expect(store.get(topicUrl)).toMatchObject({
			id: "waiting-1",
			watch: "tracking",
			season: 2,
		});
		expect(events.map((event) => event.kind)).toEqual(["download-started"]);
	});

	test("a topic already watched by another row takes the Title; the waiting row goes", async () => {
		const { module, store } = createWatchDeps();
		store.set("waiting-1", waitingWatch());
		store.set(topicUrl, {
			...waitingWatch(),
			id: "owner",
			topicUrl,
			titleId: null,
			watch: "downloading",
			source: "auto-qb",
			titleName: null,
			poster: null,
			year: null,
		});

		await module.add({
			torrentFileUrl: "https://rutracker.org/forum/dl.php?t=88",
			kind: "films",
			topicUrl,
			titleId: "tmdb:films:7",
		});

		expect([...store.values()]).toHaveLength(1);
		expect(store.get(topicUrl)).toMatchObject({
			id: "owner",
			titleId: "tmdb:films:7",
			watch: "downloading",
			titleName: "Одиссея",
		});
	});
});
