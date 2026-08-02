import { describe, expect, test } from "bun:test";
import type { CheckResult, TitleWatchRecord } from "./check-topic-now";
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
	name: "Test Show",
	year: 2024,
	overview: null,
	genres: [],
	cast: [],
	crew: [],
	runtimeMinutes: null,
	status: "Returning Series",
	seasons: 1,
	voteAverage: 7,
	voteCount: 10,
});

function createWatchDeps(overrides: Partial<TitleDeps> = {}) {
	const store = new Map<string, TitleWatchRecord>();

	const base: TitleDeps = {
		fetchTmdbMeta: async () => ({ status: "ok", meta: tvMeta() }),
		getRatings: async () => stubRatings(),
		searchLocal: async () => [],
		searchTracker: async () => ({ status: "unavailable" }),
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
		...overrides,
	};

	return { module: createTitleModule(base), store, deps: base };
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
			searchLocal: async () => [
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
			searchLocal: async () => [
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
		});

		const title = await module.get({ id: "tmdb:tv:1" });
		expect(title.watch).toMatchObject({
			topicUrl,
			watch: "tracking",
		});
		expect(store.get(topicUrl)?.titleId).toBe("tmdb:tv:1");
	});
});
