import { describe, expect, test } from "bun:test";
import {
	DEFAULT_WATCHLIST_SETTINGS,
	type WatchlistSettings,
} from "../settings/watchlist-settings";
import type {
	TaggedQbTorrent,
	TitleKind,
	TitleTorrentCandidate,
} from "./title.types";
import { extractTopicId, topicTag } from "./topic-tag";
import {
	createWaitingSearch,
	type WaitingSearchDeps,
	type WaitingTarget,
} from "./waiting-search";
import type {
	RecordWatchEventInput,
	TitleWatchRecord,
} from "./watch/check-topic-now";

const NOW = "2026-10-17T10:00:00.000Z";

const watchRecord = (
	overrides: Partial<TitleWatchRecord> = {},
): TitleWatchRecord => ({
	id: "w1",
	topicUrl: null,
	titleId: "tmdb:films:1",
	kind: "films",
	watch: "waiting",
	source: "manual",
	season: null,
	titleName: "Одиссея",
	poster: "https://image.tmdb.org/p.jpg",
	year: 2026,
	size: null,
	registeredAt: null,
	contentHash: null,
	qbHash: null,
	lastCheckedAt: null,
	lastChangedAt: null,
	lastError: null,
	waitingOutcome: null,
	waitingOutcomeDetail: null,
	createdAt: "2026-10-01T00:00:00.000Z",
	...overrides,
});

const candidate = (
	overrides: Partial<TitleTorrentCandidate> = {},
): TitleTorrentCandidate => ({
	torrentId: "100",
	title: "Одиссея / The Odyssey / 2026 / ДБ / WEB-DL (1080p)",
	size: 8e9,
	seeds: 50,
	leeches: 2,
	torrentFileUrl: "https://rutracker.org/forum/dl.php?t=100",
	topicUrl: "https://rutracker.org/forum/viewtopic.php?t=100",
	hdr: "SDR",
	resolution: "1080p",
	forumId: "2198",
	...overrides,
});

const filmTarget: WaitingTarget = {
	kind: "films",
	year: 2026,
	names: ["Одиссея", "The Odyssey"],
	season: null,
	queries: ["Одиссея 2026"],
};

type AddCall = { url: string; kind: TitleKind; tags: string[] };

type Fake = {
	deps: WaitingSearchDeps;
	rows: Map<string, TitleWatchRecord>;
	adds: AddCall[];
	events: RecordWatchEventInput[];
	queries: string[];
};

function makeFake(
	opts: {
		rows?: TitleWatchRecord[];
		targets?: Record<string, WaitingTarget | null>;
		search?: (query: string) => Promise<TitleTorrentCandidate[]>;
		rules?: WatchlistSettings;
		addToQb?: (call: AddCall) => Promise<void>;
		torrents?: TaggedQbTorrent[];
		/** Stale snapshot returned by `listWaiting` instead of the live rows. */
		waitingSnapshot?: TitleWatchRecord[];
		recordEvent?: (e: RecordWatchEventInput) => Promise<void>;
	} = {},
): Fake {
	const rows = new Map<string, TitleWatchRecord>();
	for (const row of opts.rows ?? []) rows.set(row.id, { ...row });
	const adds: AddCall[] = [];
	const events: RecordWatchEventInput[] = [];
	const queries: string[] = [];

	const deps: WaitingSearchDeps = {
		listWaiting: async () =>
			opts.waitingSnapshot ??
			[...rows.values()].filter((r) => r.watch === "waiting"),
		listDownloading: async () =>
			[...rows.values()].filter((r) => r.watch === "downloading"),
		loadWatchById: async (id) => rows.get(id) ?? null,
		loadWatchByTopicUrl: async (topicUrl) =>
			[...rows.values()].find((r) => r.topicUrl === topicUrl) ?? null,
		saveWatch: async (record) => {
			// Mirrors the real `title_watches_topic_url_unique` constraint.
			if (record.topicUrl !== null) {
				for (const other of rows.values()) {
					if (other.id !== record.id && other.topicUrl === record.topicUrl) {
						throw new Error(
							'duplicate key value violates unique constraint "title_watches_topic_url_unique"',
						);
					}
				}
			}
			rows.set(record.id, { ...record });
		},
		deleteWatch: async (id) => {
			rows.delete(id);
		},
		loadTarget: async (watch) =>
			opts.targets && watch.id in opts.targets
				? (opts.targets[watch.id] ?? null)
				: filmTarget,
		searchTracker: async (query) => {
			queries.push(query);
			return opts.search ? opts.search(query) : [candidate()];
		},
		loadRules: async () => opts.rules ?? DEFAULT_WATCHLIST_SETTINGS,
		addToQb: async (url, kind, tags) => {
			const call = { url, kind, tags };
			if (opts.addToQb) await opts.addToQb(call);
			adds.push(call);
		},
		listTaggedTorrents: async () => opts.torrents ?? [],
		recordEvent: async (e) => {
			if (opts.recordEvent) await opts.recordEvent(e);
			events.push(e);
		},
		now: () => NOW,
	};

	return { deps, rows, adds, events, queries };
}

const topicIdOf = (topicUrl: string): string => {
	const id = extractTopicId(topicUrl);
	if (!id) throw new Error(`bad topic url ${topicUrl}`);
	return id;
};

describe("createWaitingSearch.checkOne", () => {
	test("film found -> added to qB with topic tag, row becomes downloading", async () => {
		const fake = makeFake({
			rows: [watchRecord({ waitingOutcome: "no-voice" })],
		});
		const search = createWaitingSearch(fake.deps);

		const updated = await search.checkOne("w1");

		const release = candidate();
		expect(fake.adds).toEqual([
			{
				url: release.torrentFileUrl,
				kind: "films",
				tags: [topicTag(topicIdOf(release.topicUrl))],
			},
		]);
		const row = fake.rows.get("w1");
		expect(row).toMatchObject({
			watch: "downloading",
			source: "manual",
			topicUrl: release.topicUrl,
			size: release.size,
			lastChangedAt: NOW,
			lastError: null,
			waitingOutcome: null,
			waitingOutcomeDetail: null,
		});
		expect(updated).toEqual(row ?? null);
		expect(fake.events).toEqual([
			{
				titleId: "tmdb:films:1",
				topicUrl: release.topicUrl,
				kind: "download-started",
				message: release.title,
				newSize: release.size,
			},
		]);
	});

	test("series found -> row becomes tracking", async () => {
		const tvTarget: WaitingTarget = {
			kind: "tv",
			year: 2026,
			names: ["Одиссея", "The Odyssey"],
			season: 5,
			queries: ["Одиссея сезон 5"],
		};
		const release = candidate({
			torrentId: "200",
			title: "Одиссея / The Odyssey / Сезон: 5 / 2026 / ДБ / WEB-DL (1080p)",
			torrentFileUrl: "https://rutracker.org/forum/dl.php?t=200",
			topicUrl: "https://rutracker.org/forum/viewtopic.php?t=200",
		});
		const fake = makeFake({
			rows: [
				watchRecord({
					titleId: "tmdb:tv:2",
					kind: "tv",
					season: 5,
					source: "auto-qb",
				}),
			],
			targets: { w1: tvTarget },
			search: async () => [release],
		});

		await createWaitingSearch(fake.deps).checkOne("w1");

		expect(fake.adds).toEqual([
			{
				url: release.torrentFileUrl,
				kind: "tv",
				tags: [topicTag(topicIdOf(release.topicUrl))],
			},
		]);
		expect(fake.rows.get("w1")).toMatchObject({
			watch: "tracking",
			source: "manual",
			topicUrl: release.topicUrl,
			size: release.size,
		});
	});

	test("nothing suitable -> stays waiting with outcome and detail", async () => {
		const fake = makeFake({
			rows: [watchRecord()],
			search: async () => [
				candidate({
					title: "Одиссея / The Odyssey / 2026 / ДБ / WEB-DL (720p)",
					resolution: "720p",
				}),
			],
		});

		const updated = await createWaitingSearch(fake.deps).checkOne("w1");

		expect(fake.adds).toEqual([]);
		expect(updated).toMatchObject({
			watch: "waiting",
			topicUrl: null,
			waitingOutcome: "below-resolution",
			waitingOutcomeDetail: "720p",
			lastCheckedAt: NOW,
		});
		expect(fake.events).toEqual([]);
	});

	test("search throws -> outcome search-failed with lastError", async () => {
		const fake = makeFake({
			rows: [watchRecord()],
			search: async () => {
				throw new Error("Трекеры недоступны");
			},
		});

		const updated = await createWaitingSearch(fake.deps).checkOne("w1");

		expect(fake.adds).toEqual([]);
		expect(updated).toMatchObject({
			watch: "waiting",
			waitingOutcome: "search-failed",
			waitingOutcomeDetail: null,
			lastError: "Трекеры недоступны",
			lastCheckedAt: NOW,
		});
	});

	test("addToQb throws -> stays waiting, lastError, add-failed event", async () => {
		const fake = makeFake({
			rows: [watchRecord()],
			addToQb: async () => {
				throw new Error("qBittorrent недоступен");
			},
		});

		const updated = await createWaitingSearch(fake.deps).checkOne("w1");

		expect(updated).toMatchObject({
			watch: "waiting",
			topicUrl: null,
			lastError: "qBittorrent недоступен",
			lastCheckedAt: NOW,
		});
		expect(fake.events).toEqual([
			{
				titleId: "tmdb:films:1",
				topicUrl: candidate().topicUrl,
				kind: "add-failed",
				message: "qBittorrent недоступен",
			},
		]);
	});

	test("topic already owned by another row -> merge into that row, delete waiting row, no add", async () => {
		const release = candidate();
		const owner = watchRecord({
			id: "w-owner",
			topicUrl: release.topicUrl,
			titleId: null,
			kind: null,
			watch: "downloading",
			source: "auto-qb",
			titleName: null,
			poster: null,
			year: null,
			size: 7e9,
		});
		const fake = makeFake({ rows: [owner, watchRecord()] });

		const updated = await createWaitingSearch(fake.deps).checkOne("w1");

		expect(fake.adds).toEqual([]);
		expect(fake.rows.has("w1")).toBe(false);
		const merged = fake.rows.get("w-owner");
		expect(merged).toEqual({
			...owner,
			titleId: "tmdb:films:1",
			kind: "films",
			titleName: "Одиссея",
			poster: "https://image.tmdb.org/p.jpg",
			year: 2026,
		});
		expect(updated).toEqual(merged ?? null);
	});

	test("queries passed to searchTracker are exactly target.queries; results deduped by torrentId", async () => {
		const first = candidate({
			title: "Одиссея / The Odyssey / 2026 / ДБ / WEB-DL (720p)",
			resolution: "720p",
		});
		// Same torrentId under the second query: the first occurrence wins.
		const duplicate = candidate();
		const fake = makeFake({
			rows: [watchRecord()],
			targets: {
				w1: { ...filmTarget, queries: ["Одиссея 2026", "The Odyssey 2026"] },
			},
			search: async (query) =>
				query === "Одиссея 2026" ? [first] : [duplicate],
		});

		const updated = await createWaitingSearch(fake.deps).checkOne("w1");

		expect(fake.queries).toEqual(["Одиссея 2026", "The Odyssey 2026"]);
		expect(fake.adds).toEqual([]);
		expect(updated?.waitingOutcome).toBe("below-resolution");
	});

	test("event recording failure does not break the flow", async () => {
		const fake = makeFake({
			rows: [watchRecord()],
			recordEvent: async () => {
				throw new Error("feed down");
			},
		});

		const updated = await createWaitingSearch(fake.deps).checkOne("w1");

		expect(updated?.watch).toBe("downloading");
	});

	test("returns null for a missing id or a row that isn't waiting", async () => {
		const fake = makeFake({
			rows: [watchRecord({ id: "w2", watch: "tracking" })],
		});
		const search = createWaitingSearch(fake.deps);

		expect(await search.checkOne("missing")).toBeNull();
		expect(await search.checkOne("w2")).toBeNull();
		expect(fake.queries).toEqual([]);
	});
});

describe("createWaitingSearch.runAll", () => {
	test("keeps going after one title's search throws; second title still started", async () => {
		const fake = makeFake({
			rows: [
				watchRecord({ id: "w1", titleName: "Сломанный" }),
				watchRecord({ id: "w2", titleId: "tmdb:films:2" }),
			],
			targets: {
				w1: { ...filmTarget, queries: ["broken"] },
				w2: filmTarget,
			},
			search: async (query) => {
				if (query === "broken") throw new Error("boom");
				return [candidate()];
			},
		});
		const lines: string[] = [];

		const run = await createWaitingSearch(fake.deps).runAll((line) =>
			lines.push(line),
		);

		expect(run).toEqual({ checked: 2, started: 1, failed: 1 });
		expect(fake.rows.get("w1")?.waitingOutcome).toBe("search-failed");
		expect(fake.rows.get("w2")?.watch).toBe("downloading");
		expect(lines.length).toBe(2);
		expect(lines[0]).toContain("Сломанный");
		expect(lines[0]).toContain("search-failed");
	});
});

describe("createWaitingSearch stale and repeated runs", () => {
	test("watch deleted after listWaiting -> not saved back, no add", async () => {
		const stale = watchRecord();
		const fake = makeFake({ rows: [], waitingSnapshot: [stale] });

		const run = await createWaitingSearch(fake.deps).runAll();

		expect(fake.rows.has("w1")).toBe(false);
		expect(fake.adds).toEqual([]);
		expect(fake.queries).toEqual([]);
		expect(run).toEqual({ checked: 0, started: 0, failed: 0 });
	});

	test("watch already downloading when re-read -> skipped, no second download-started", async () => {
		const live = watchRecord({
			watch: "downloading",
			topicUrl: candidate().topicUrl,
			size: candidate().size,
		});
		const fake = makeFake({
			rows: [live],
			waitingSnapshot: [watchRecord()],
		});

		await createWaitingSearch(fake.deps).runAll();

		expect(fake.rows.get("w1")).toEqual(live);
		expect(fake.adds).toEqual([]);
		expect(fake.events).toEqual([]);
	});

	test("watch removed while searching -> no add, not saved back", async () => {
		const fake = makeFake({ rows: [watchRecord()] });
		fake.deps.searchTracker = async () => {
			fake.rows.delete("w1");
			return [candidate()];
		};

		const updated = await createWaitingSearch(fake.deps).checkOne("w1");

		expect(updated).toBeNull();
		expect(fake.rows.has("w1")).toBe(false);
		expect(fake.adds).toEqual([]);
		expect(fake.events).toEqual([]);
	});

	test("transfer for the topic already in qB -> no add, row still started", async () => {
		const release = candidate();
		const fake = makeFake({
			rows: [watchRecord()],
			torrents: [
				{
					hash: "abc",
					progress: 0.2,
					stateKind: "downloading",
					stateLabel: "Загружается",
					downloadSpeed: 1000,
					etaSeconds: 60,
					tags: topicTag(topicIdOf(release.topicUrl)),
				},
			],
		});

		const updated = await createWaitingSearch(fake.deps).checkOne("w1");

		expect(fake.adds).toEqual([]);
		expect(updated).toMatchObject({
			watch: "downloading",
			topicUrl: release.topicUrl,
			size: release.size,
		});
		expect(fake.events.map((e) => e.kind)).toEqual(["download-started"]);
	});

	test("add-failed event only when the error message changes", async () => {
		let message = "qBittorrent недоступен";
		const fake = makeFake({
			rows: [watchRecord()],
			addToQb: async () => {
				throw new Error(message);
			},
		});
		const search = createWaitingSearch(fake.deps);

		await search.checkOne("w1");
		await search.checkOne("w1");
		message = "Неверный пароль qBittorrent";
		await search.checkOne("w1");

		expect(fake.events.map((e) => [e.kind, e.message])).toEqual([
			["add-failed", "qBittorrent недоступен"],
			["add-failed", "Неверный пароль qBittorrent"],
		]);
		expect(fake.rows.get("w1")?.lastError).toBe("Неверный пароль qBittorrent");
	});
});

describe("createWaitingSearch.syncDownloads", () => {
	const topicUrl = "https://rutracker.org/forum/viewtopic.php?t=100";
	const torrent = (progress: number): TaggedQbTorrent => ({
		hash: "abc",
		progress,
		stateKind: "seeding",
		stateLabel: "Раздаётся",
		downloadSpeed: 0,
		etaSeconds: 0,
		tags: topicTag(topicIdOf(topicUrl)),
	});

	test("downloaded film -> completed + downloaded event", async () => {
		const fake = makeFake({
			rows: [watchRecord({ watch: "downloading", topicUrl })],
			torrents: [torrent(1)],
		});

		const result = await createWaitingSearch(fake.deps).syncDownloads();

		expect(result).toEqual({ completed: 1 });
		expect(fake.rows.get("w1")).toMatchObject({
			watch: "completed",
			lastChangedAt: NOW,
		});
		expect(fake.events).toEqual([
			{
				titleId: "tmdb:films:1",
				topicUrl,
				kind: "downloaded",
				message: null,
			},
		]);
	});

	test("still downloading -> unchanged", async () => {
		const row = watchRecord({ watch: "downloading", topicUrl });
		const fake = makeFake({ rows: [row], torrents: [torrent(0.5)] });

		const result = await createWaitingSearch(fake.deps).syncDownloads();

		expect(result).toEqual({ completed: 0 });
		expect(fake.rows.get("w1")).toEqual(row);
	});

	test("no transfer -> unchanged", async () => {
		const row = watchRecord({ watch: "downloading", topicUrl });
		const fake = makeFake({ rows: [row], torrents: [] });

		const result = await createWaitingSearch(fake.deps).syncDownloads();

		expect(result).toEqual({ completed: 0 });
		expect(fake.rows.get("w1")).toEqual(row);
		expect(fake.events).toEqual([]);
	});
});
