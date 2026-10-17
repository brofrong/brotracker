import { describe, expect, test } from "bun:test";
import type { TaggedQbTorrent, Title, TitleKind } from "./title.types";
import type { TitleWatchRecord } from "./watch/check-topic-now";
import type { SyncQbTorrent } from "./watch/sync-watches-from-qb";
import {
	createWatchlist,
	type WatchlistDeps,
	WatchlistError,
} from "./watchlist";

const NOW = "2026-10-17T10:00:00.000Z";
const TOPIC = "https://rutracker.org/forum/viewtopic.php?t=100";

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

const title = (kind: TitleKind, overrides: Partial<Title["meta"]> = {}) =>
	({
		id: kind === "films" ? "tmdb:films:1" : "tmdb:tv:2",
		facet: kind,
		metaStatus: "ok",
		meta: {
			poster: kind === "films" ? "https://image.tmdb.org/p.jpg" : "tv.jpg",
			backdrop: null,
			name: kind === "films" ? "Одиссея" : "Одни из нас",
			year: kind === "films" ? 2026 : 2023,
			overview: null,
			genres: [],
			cast: [],
			crew: [],
			similar: [],
			runtimeMinutes: null,
			status: null,
			seasons: kind === "tv" ? 2 : null,
			originalName: kind === "films" ? "The Odyssey" : "The Last of Us",
			alternativeNames: [],
			seasonAirYears: {},
			lastAirYear: null,
			...overrides,
		},
		ratings: [],
		watch: null,
	}) satisfies Title;

const tagged = (overrides: Partial<TaggedQbTorrent> = {}): TaggedQbTorrent => ({
	hash: "h1",
	progress: 0.4,
	stateKind: "downloading",
	stateLabel: "Загрузка",
	downloadSpeed: 1000,
	etaSeconds: 60,
	tags: "brotracker:topic:100",
	...overrides,
});

type Fake = {
	deps: WatchlistDeps;
	rows: Map<string, TitleWatchRecord>;
	checkedWaiting: string[];
	checkedTracking: string[];
};

function makeFake(
	opts: {
		rows?: TitleWatchRecord[];
		titles?: Record<string, Title>;
		torrents?: TaggedQbTorrent[];
		qbTorrents?: SyncQbTorrent[];
		checkWaiting?: (rows: Map<string, TitleWatchRecord>, id: string) => void;
	} = {},
): Fake {
	const rows = new Map<string, TitleWatchRecord>();
	for (const row of opts.rows ?? []) rows.set(row.id, { ...row });
	const checkedWaiting: string[] = [];
	const checkedTracking: string[] = [];
	let nextId = 0;

	const deps: WatchlistDeps = {
		getTitle: async (titleId) => {
			const found = opts.titles?.[titleId];
			if (!found) throw new Error(`no title ${titleId}`);
			return found;
		},
		loadWatchByTitleId: async (titleId) =>
			[...rows.values()].find((r) => r.titleId === titleId) ?? null,
		loadWatchById: async (id) => rows.get(id) ?? null,
		listWatchlistRecords: async () =>
			[...rows.values()].filter((r) => r.titleId !== null),
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
		listTaggedTorrents: async () => opts.torrents ?? [],
		listQbTorrents: async () => opts.qbTorrents ?? [],
		checkWaiting: async (id) => {
			checkedWaiting.push(id);
			opts.checkWaiting?.(rows, id);
			return rows.get(id) ?? null;
		},
		checkTracking: async ({ topicUrl }) => {
			checkedTracking.push(topicUrl);
			return { status: "unchanged", checkedAt: NOW };
		},
		now: () => NOW,
		newId: () => {
			nextId += 1;
			return `new-${nextId}`;
		},
	};

	return { deps, rows, checkedWaiting, checkedTracking };
}

describe("watchlist.wait", () => {
	test("creates a waiting film row with name, poster and year", async () => {
		const fake = makeFake({ titles: { "tmdb:films:1": title("films") } });
		const watchlist = createWatchlist(fake.deps);

		const view = await watchlist.wait({ titleId: "tmdb:films:1" });

		expect(fake.rows.get("new-1")).toEqual(
			watchRecord({
				id: "new-1",
				lastChangedAt: NOW,
				createdAt: NOW,
			}),
		);
		expect(view).toMatchObject({
			id: "new-1",
			kind: "films",
			watch: "waiting",
			topicUrl: null,
			season: null,
			progress: null,
		});
	});

	test("stores the latest season for a series", async () => {
		const fake = makeFake({ titles: { "tmdb:tv:2": title("tv") } });
		const watchlist = createWatchlist(fake.deps);

		await watchlist.wait({ titleId: "tmdb:tv:2" });

		expect(fake.rows.get("new-1")).toMatchObject({
			titleId: "tmdb:tv:2",
			kind: "tv",
			watch: "waiting",
			season: 2,
			titleName: "Одни из нас",
			poster: "tv.jpg",
			year: 2023,
		});
	});

	test("an existing tracking watch is returned unchanged and nothing is created", async () => {
		const tracking = watchRecord({
			id: "w-tv",
			titleId: "tmdb:tv:2",
			kind: "tv",
			watch: "tracking",
			topicUrl: TOPIC,
			qbHash: "h1",
		});
		const fake = makeFake({
			rows: [tracking],
			titles: { "tmdb:tv:2": title("tv") },
			qbTorrents: [
				{
					hash: "h1",
					name: "Одни из нас / Сезон: 2 / Серии: 1-5 из 7",
					savePath: "/tv",
					tags: "",
					size: 1,
				},
			],
		});
		const watchlist = createWatchlist(fake.deps);

		const view = await watchlist.wait({ titleId: "tmdb:tv:2" });

		expect([...fake.rows.values()]).toEqual([tracking]);
		expect(view).toMatchObject({
			id: "w-tv",
			watch: "tracking",
			topicUrl: TOPIC,
			progress: { have: 5, total: 7 },
		});
	});

	test("an off series row with a topic goes back to tracking", async () => {
		const off = watchRecord({
			id: "w-off",
			titleId: "tmdb:tv:2",
			kind: "tv",
			watch: "off",
			topicUrl: TOPIC,
			qbHash: "h1",
			titleName: null,
			poster: null,
			year: null,
		});
		const fake = makeFake({
			rows: [off],
			titles: { "tmdb:tv:2": title("tv") },
		});
		const watchlist = createWatchlist(fake.deps);

		const view = await watchlist.wait({ titleId: "tmdb:tv:2" });

		expect(fake.rows.size).toBe(1);
		expect(fake.rows.get("w-off")).toMatchObject({
			watch: "tracking",
			topicUrl: TOPIC,
			qbHash: "h1",
			titleName: "Одни из нас",
			poster: "tv.jpg",
			year: 2023,
			lastChangedAt: NOW,
		});
		expect(view.watch).toBe("tracking");
	});

	test("an off row without a topic becomes waiting again", async () => {
		const off = watchRecord({
			id: "w-off",
			watch: "off",
			lastError: "boom",
			waitingOutcome: "no-voice",
			lastCheckedAt: "2026-10-10T00:00:00.000Z",
		});
		const fake = makeFake({
			rows: [off],
			titles: { "tmdb:films:1": title("films") },
		});
		const watchlist = createWatchlist(fake.deps);

		await watchlist.wait({ titleId: "tmdb:films:1" });

		expect(fake.rows.size).toBe(1);
		expect(fake.rows.get("w-off")).toMatchObject({
			watch: "waiting",
			topicUrl: null,
			lastError: null,
			waitingOutcome: null,
			lastCheckedAt: null,
			lastChangedAt: NOW,
			createdAt: off.createdAt,
		});
	});

	test("a Title without a TMDB facet cannot be waited for", async () => {
		const fake = makeFake({
			titles: { "tmdb:films:9": { ...title("films"), facet: null } },
		});
		const watchlist = createWatchlist(fake.deps);

		await expect(watchlist.wait({ titleId: "tmdb:films:9" })).rejects.toThrow();
		expect(fake.rows.size).toBe(0);
	});
});

describe("watchlist.wait with degraded TMDB meta", () => {
	const degraded = (): Title => ({
		...title("tv", {
			name: null,
			poster: null,
			year: null,
			seasons: null,
			originalName: null,
		}),
		metaStatus: "degraded",
	});

	test("refuses to create a nameless row", async () => {
		const fake = makeFake({ titles: { "tmdb:tv:2": degraded() } });
		const watchlist = createWatchlist(fake.deps);

		await expect(watchlist.wait({ titleId: "tmdb:tv:2" })).rejects.toThrow(
			WatchlistError,
		);
		expect(fake.rows.size).toBe(0);
	});

	test("leaves an off row untouched", async () => {
		const off = watchRecord({
			id: "w-off",
			titleId: "tmdb:tv:2",
			kind: "tv",
			watch: "off",
			topicUrl: TOPIC,
			qbHash: "h1",
		});
		const fake = makeFake({
			rows: [off],
			titles: { "tmdb:tv:2": degraded() },
		});
		const watchlist = createWatchlist(fake.deps);

		await expect(watchlist.wait({ titleId: "tmdb:tv:2" })).rejects.toThrow(
			WatchlistError,
		);
		expect(fake.rows.get("w-off")).toEqual(off);
	});
});

describe("watchlist.remove", () => {
	test("deletes a waiting row", async () => {
		const fake = makeFake({ rows: [watchRecord()] });
		await createWatchlist(fake.deps).remove({ id: "w1" });
		expect(fake.rows.size).toBe(0);
	});

	test("switches a series row with a topic off", async () => {
		const fake = makeFake({
			rows: [
				watchRecord({
					titleId: "tmdb:tv:2",
					kind: "tv",
					watch: "tracking",
					topicUrl: TOPIC,
				}),
			],
		});
		await createWatchlist(fake.deps).remove({ id: "w1" });
		expect(fake.rows.get("w1")).toMatchObject({
			watch: "off",
			topicUrl: TOPIC,
			lastChangedAt: NOW,
		});
	});

	test("deletes a downloading film row", async () => {
		const fake = makeFake({
			rows: [watchRecord({ watch: "downloading", topicUrl: TOPIC })],
		});
		await createWatchlist(fake.deps).remove({ id: "w1" });
		expect(fake.rows.size).toBe(0);
	});

	test("missing row is a no-op", async () => {
		const fake = makeFake();
		await createWatchlist(fake.deps).remove({ id: "nope" });
		expect(fake.rows.size).toBe(0);
	});
});

describe("watchlist.list", () => {
	test("attaches the transfer from the topic tag and excludes off rows", async () => {
		const fake = makeFake({
			rows: [
				watchRecord({ id: "w1", watch: "downloading", topicUrl: TOPIC }),
				watchRecord({ id: "w2", titleId: "tmdb:films:2", watch: "off" }),
				watchRecord({ id: "w3", titleId: "tmdb:films:3" }),
			],
			torrents: [tagged()],
		});

		const items = await createWatchlist(fake.deps).list();

		expect(items.map((item) => item.id)).toEqual(["w1", "w3"]);
		expect(items[0]).toEqual({
			id: "w1",
			titleId: "tmdb:films:1",
			kind: "films",
			name: "Одиссея",
			poster: "https://image.tmdb.org/p.jpg",
			year: 2026,
			season: null,
			watch: "downloading",
			topicUrl: TOPIC,
			lastCheckedAt: null,
			lastChangedAt: null,
			lastError: null,
			waitingOutcome: null,
			waitingOutcomeDetail: null,
			episodes: null,
			transfer: {
				hash: "h1",
				progress: 0.4,
				stateKind: "downloading",
				stateLabel: "Загрузка",
				downloadSpeed: 1000,
				etaSeconds: 60,
			},
			createdAt: "2026-10-01T00:00:00.000Z",
		});
		expect(items[1]?.transfer).toBeNull();
	});

	test("episodes come from the qB torrent name of a tracked series", async () => {
		const fake = makeFake({
			rows: [
				watchRecord({
					titleId: "tmdb:tv:2",
					kind: "tv",
					watch: "tracking",
					topicUrl: TOPIC,
				}),
			],
			torrents: [tagged()],
			qbTorrents: [
				{
					hash: "h1",
					name: "Одни из нас / Сезон: 2 / Серии: 1-5 из 7",
					savePath: "/tv",
					tags: "brotracker:topic:100",
					size: 1,
				},
			],
		});

		const [item] = await createWatchlist(fake.deps).list();

		expect(item?.episodes).toEqual({ have: 5, total: 7 });
	});

	test("qBittorrent being down still lists the rows", async () => {
		const fake = makeFake({ rows: [watchRecord()] });
		fake.deps.listTaggedTorrents = async () => {
			throw new Error("qB down");
		};
		fake.deps.listQbTorrents = async () => {
			throw new Error("qB down");
		};

		const items = await createWatchlist(fake.deps).list();

		expect(items).toHaveLength(1);
		expect(items[0]?.transfer).toBeNull();
	});
});

describe("watchlist.list backfills legacy rows", () => {
	const legacy = (id: string, titleId = "tmdb:tv:2") =>
		watchRecord({
			id,
			titleId,
			kind: "tv",
			watch: "tracking",
			topicUrl: `https://rutracker.org/forum/viewtopic.php?t=${id}`,
			titleName: null,
			poster: null,
			year: null,
		});

	test("fills name, poster and year from TMDB and lists them", async () => {
		const fake = makeFake({
			rows: [legacy("1")],
			titles: { "tmdb:tv:2": title("tv") },
		});

		const [item] = await createWatchlist(fake.deps).list();

		expect(item).toMatchObject({
			name: "Одни из нас",
			poster: "tv.jpg",
			year: 2023,
		});
		expect(fake.rows.get("1")).toMatchObject({
			titleName: "Одни из нас",
			poster: "tv.jpg",
			year: 2023,
			watch: "tracking",
		});
	});

	test("at most 5 rows per call; non-TMDB titles are skipped", async () => {
		const rows = [
			...["1", "2", "3", "4", "5", "6", "7"].map((id) => legacy(id)),
			legacy("8", "topic:8"),
		];
		const fake = makeFake({ rows, titles: { "tmdb:tv:2": title("tv") } });
		const asked: string[] = [];
		const getTitle = fake.deps.getTitle;
		fake.deps.getTitle = async (titleId) => {
			asked.push(titleId);
			return getTitle(titleId);
		};

		const items = await createWatchlist(fake.deps).list();

		expect(asked).toHaveLength(5);
		expect(asked.every((id) => id === "tmdb:tv:2")).toBe(true);
		expect(items.filter((item) => item.name !== null)).toHaveLength(5);
		expect(items).toHaveLength(8);
	});

	test("TMDB errors or degraded meta never fail the list", async () => {
		const fake = makeFake({
			rows: [legacy("1"), legacy("2", "tmdb:tv:3")],
			titles: {
				"tmdb:tv:3": { ...title("tv"), metaStatus: "degraded" },
			},
		});

		const items = await createWatchlist(fake.deps).list();

		expect(items).toHaveLength(2);
		expect(items.every((item) => item.name === null)).toBe(true);
		expect(fake.rows.get("2")?.titleName).toBeNull();
	});

	test("a row filled while TMDB was asked is listed with that name and not saved again", async () => {
		const fake = makeFake({
			rows: [legacy("1")],
			titles: { "tmdb:tv:2": title("tv") },
		});
		const getTitle = fake.deps.getTitle;
		fake.deps.getTitle = async (titleId) => {
			const row = fake.rows.get("1");
			if (row) fake.rows.set("1", { ...row, titleName: "Уже есть" });
			return getTitle(titleId);
		};
		let saves = 0;
		const save = fake.deps.saveWatch;
		fake.deps.saveWatch = async (record) => {
			saves += 1;
			await save(record);
		};

		const [item] = await createWatchlist(fake.deps).list();

		expect(item?.name).toBe("Уже есть");
		expect(saves).toBe(0);
	});

	test("a save failure never fails the list", async () => {
		const fake = makeFake({
			rows: [legacy("1")],
			titles: { "tmdb:tv:2": title("tv") },
		});
		fake.deps.saveWatch = async () => {
			throw new Error("db down");
		};

		const items = await createWatchlist(fake.deps).list();

		expect(items).toHaveLength(1);
	});
});

describe("watchlist.checkNow", () => {
	test("a waiting row goes through the waiting search", async () => {
		const fake = makeFake({
			rows: [watchRecord()],
			checkWaiting: (rows, id) => {
				const row = rows.get(id);
				if (row) rows.set(id, { ...row, waitingOutcome: "no-releases" });
			},
		});

		const item = await createWatchlist(fake.deps).checkNow({ id: "w1" });

		expect(fake.checkedWaiting).toEqual(["w1"]);
		expect(fake.checkedTracking).toEqual([]);
		expect(item?.waitingOutcome).toBe("no-releases");
	});

	test("a tracking row goes through the existing title check", async () => {
		const fake = makeFake({
			rows: [
				watchRecord({
					titleId: "tmdb:tv:2",
					kind: "tv",
					watch: "tracking",
					topicUrl: TOPIC,
				}),
			],
		});

		const item = await createWatchlist(fake.deps).checkNow({ id: "w1" });

		expect(fake.checkedTracking).toEqual([TOPIC]);
		expect(fake.checkedWaiting).toEqual([]);
		expect(item?.id).toBe("w1");
	});

	test("a waiting row merged into another watch returns that watch", async () => {
		const owner = watchRecord({
			id: "owner",
			titleId: null,
			watch: "downloading",
			topicUrl: TOPIC,
		});
		const fake = makeFake({
			rows: [watchRecord(), owner],
			checkWaiting: (rows, id) => {
				rows.set("owner", { ...owner, titleId: "tmdb:films:1" });
				rows.delete(id);
			},
		});

		const item = await createWatchlist(fake.deps).checkNow({ id: "w1" });

		expect(item?.id).toBe("owner");
	});

	test("missing row returns null", async () => {
		const fake = makeFake();
		expect(
			await createWatchlist(fake.deps).checkNow({ id: "nope" }),
		).toBeNull();
	});
});

const SEASON_1_TOPIC = "https://rutracker.org/forum/viewtopic.php?t=51";
const SEASON_2_TOPIC = "https://rutracker.org/forum/viewtopic.php?t=52";

/** Old-model data: one row per season topic for the same Title. */
const multiRowSeries = () => [
	// Newest first, so `loadWatchByTitleId` returns season 2.
	watchRecord({
		id: "s2",
		titleId: "tmdb:tv:2",
		kind: "tv",
		watch: "tracking",
		season: 2,
		topicUrl: SEASON_2_TOPIC,
	}),
	watchRecord({
		id: "s1",
		titleId: "tmdb:tv:2",
		kind: "tv",
		watch: "tracking",
		season: 1,
		topicUrl: SEASON_1_TOPIC,
	}),
];

describe("watchlist.checkNow on a multi-row series", () => {
	test("checks the clicked row's own topic", async () => {
		const fake = makeFake({ rows: multiRowSeries() });

		const item = await createWatchlist(fake.deps).checkNow({ id: "s1" });

		expect(fake.checkedTracking).toEqual([SEASON_1_TOPIC]);
		expect(item?.id).toBe("s1");
	});

	test("a paused row is checked by its own topic too", async () => {
		const rows = multiRowSeries();
		rows[1] = { ...(rows[1] as TitleWatchRecord), watch: "paused" };
		const fake = makeFake({ rows });

		await createWatchlist(fake.deps).checkNow({ id: "s1" });

		expect(fake.checkedTracking).toEqual([SEASON_1_TOPIC]);
	});
});

describe("watchlist.setState", () => {
	test("pauses the clicked row only", async () => {
		const fake = makeFake({ rows: multiRowSeries() });

		const item = await createWatchlist(fake.deps).setState({
			id: "s1",
			watch: "paused",
		});

		expect(item).toMatchObject({ id: "s1", watch: "paused" });
		expect(fake.rows.get("s1")).toMatchObject({
			watch: "paused",
			topicUrl: SEASON_1_TOPIC,
		});
		expect(fake.rows.get("s2")).toMatchObject({
			watch: "tracking",
			topicUrl: SEASON_2_TOPIC,
		});
	});

	test("resumes a paused row", async () => {
		const rows = multiRowSeries();
		rows[1] = { ...(rows[1] as TitleWatchRecord), watch: "paused" };
		const fake = makeFake({ rows });

		await createWatchlist(fake.deps).setState({ id: "s1", watch: "tracking" });

		expect(fake.rows.get("s1")?.watch).toBe("tracking");
	});

	test("only a tracking or paused row with a topic can change state", async () => {
		const fake = makeFake({ rows: [watchRecord()] });

		await expect(
			createWatchlist(fake.deps).setState({ id: "w1", watch: "paused" }),
		).rejects.toBeInstanceOf(WatchlistError);
		expect(fake.rows.get("w1")?.watch).toBe("waiting");
	});

	test("missing row returns null", async () => {
		const fake = makeFake();
		expect(
			await createWatchlist(fake.deps).setState({
				id: "nope",
				watch: "paused",
			}),
		).toBeNull();
	});
});
