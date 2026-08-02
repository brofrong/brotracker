import { describe, expect, test } from "bun:test";
import type { TitleWatchRecord } from "./check-topic-now";
import { syncWatchesFromQb } from "./sync-watches-from-qb";

describe("syncWatchesFromQb", () => {
	test("upserts tracking watches for seriesPath torrents with topic tags", async () => {
		const store = new Map<string, TitleWatchRecord>();

		const result = await syncWatchesFromQb({
			listTorrents: async () => [
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
			getSeriesPath: async () => "/data/tv",
			loadWatch: async (topicUrl) => store.get(topicUrl) ?? null,
			saveWatch: async (record) => {
				store.set(record.topicUrl, record);
			},
			isCompletePack: () => false,
			now: () => "2026-08-02T13:00:00.000Z",
		});

		expect(result.upserted).toBe(1);
		const topicUrl = "https://rutracker.org/forum/viewtopic.php?t=100";
		expect(store.get(topicUrl)).toMatchObject({
			topicUrl,
			watch: "tracking",
			source: "auto-qb",
			qbHash: "h1",
			size: 1000,
		});
		expect(store.has("https://rutracker.org/forum/viewtopic.php?t=200")).toBe(
			false,
		);
	});

	test("does not flip paused watches back to tracking", async () => {
		const topicUrl = "https://rutracker.org/forum/viewtopic.php?t=100";
		const store = new Map<string, TitleWatchRecord>([
			[
				topicUrl,
				{
					topicUrl,
					titleId: null,
					watch: "paused",
					source: "manual",
					size: 1000,
					registeredAt: null,
					contentHash: null,
					qbHash: "old",
					lastCheckedAt: null,
					lastChangedAt: null,
					lastError: null,
				},
			],
		]);

		await syncWatchesFromQb({
			listTorrents: async () => [
				{
					hash: "newhash",
					name: "Show",
					savePath: "/data/tv",
					tags: "brotracker:topic:100",
					size: 1000,
				},
			],
			getSeriesPath: async () => "/data/tv",
			loadWatch: async (url) => store.get(url) ?? null,
			saveWatch: async (record) => {
				store.set(record.topicUrl, record);
			},
			isCompletePack: () => false,
			now: () => "2026-08-02T13:00:00.000Z",
		});

		expect(store.get(topicUrl)?.watch).toBe("paused");
		expect(store.get(topicUrl)?.qbHash).toBe("newhash");
	});

	test("skips complete packs for new auto-follows", async () => {
		const store = new Map<string, TitleWatchRecord>();

		const result = await syncWatchesFromQb({
			listTorrents: async () => [
				{
					hash: "h1",
					name: "Show 10 из 10",
					savePath: "/data/tv",
					tags: "brotracker:topic:100",
					size: 1000,
				},
			],
			getSeriesPath: async () => "/data/tv",
			loadWatch: async (url) => store.get(url) ?? null,
			saveWatch: async (record) => {
				store.set(record.topicUrl, record);
			},
			isCompletePack: (name) => name.includes("10 из 10"),
			now: () => "2026-08-02T13:00:00.000Z",
		});

		expect(result.upserted).toBe(0);
		expect(store.size).toBe(0);
	});

	test("flips a tracking watch to completed once the name reports a full pack", async () => {
		const topicUrl = "https://rutracker.org/forum/viewtopic.php?t=100";
		const store = new Map<string, TitleWatchRecord>([
			[
				topicUrl,
				{
					topicUrl,
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
				},
			],
		]);

		await syncWatchesFromQb({
			listTorrents: async () => [
				{
					hash: "h1",
					name: "Show 10 из 10",
					savePath: "/data/tv",
					tags: "brotracker:topic:100",
					size: 1000,
				},
			],
			getSeriesPath: async () => "/data/tv",
			loadWatch: async (url) => store.get(url) ?? null,
			saveWatch: async (record) => {
				store.set(record.topicUrl, record);
			},
			isCompletePack: (name) => name.includes("10 из 10"),
			now: () => "2026-08-02T13:00:00.000Z",
		});

		expect(store.get(topicUrl)?.watch).toBe("completed");
	});

	test("records a completed feed event when a tracking watch finishes", async () => {
		const topicUrl = "https://rutracker.org/forum/viewtopic.php?t=100";
		const store = new Map<string, TitleWatchRecord>([
			[
				topicUrl,
				{
					topicUrl,
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
				},
			],
		]);
		const events: Array<{ kind: string; titleId: string | null }> = [];

		await syncWatchesFromQb({
			listTorrents: async () => [
				{
					hash: "h1",
					name: "Show 10 из 10",
					savePath: "/data/tv",
					tags: "brotracker:topic:100",
					size: 1000,
				},
			],
			getSeriesPath: async () => "/data/tv",
			loadWatch: async (url) => store.get(url) ?? null,
			saveWatch: async (record) => {
				store.set(record.topicUrl, record);
			},
			isCompletePack: (name) => name.includes("10 из 10"),
			now: () => "2026-08-02T13:00:00.000Z",
			recordEvent: async (event) => {
				events.push({ kind: event.kind, titleId: event.titleId });
			},
		});

		expect(events).toEqual([{ kind: "completed", titleId: "tmdb:tv:1" }]);
	});

	test("leaves an incomplete tracking watch alone", async () => {
		const topicUrl = "https://rutracker.org/forum/viewtopic.php?t=100";
		const store = new Map<string, TitleWatchRecord>([
			[
				topicUrl,
				{
					topicUrl,
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
				},
			],
		]);

		await syncWatchesFromQb({
			listTorrents: async () => [
				{
					hash: "h1",
					name: "Show 1-8 из 10",
					savePath: "/data/tv",
					tags: "brotracker:topic:100",
					size: 1000,
				},
			],
			getSeriesPath: async () => "/data/tv",
			loadWatch: async (url) => store.get(url) ?? null,
			saveWatch: async (record) => {
				store.set(record.topicUrl, record);
			},
			isCompletePack: (name) => name.includes("10 из 10"),
			now: () => "2026-08-02T13:00:00.000Z",
		});

		expect(store.get(topicUrl)?.watch).toBe("tracking");
	});
});
