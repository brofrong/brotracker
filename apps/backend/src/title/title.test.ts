import { describe, expect, test } from "bun:test";
import {
	createTitleModule,
	encodeTopicUrl,
	type TitleDeps,
	TitleLinkError,
} from "./title";
import type {
	FetchTmdbMetaOutcome,
	TitleKind,
	TitleMeta,
	TitleRating,
	TmdbMeta,
} from "./title.types";

const emptyMeta = (): TitleMeta => ({
	poster: null,
	backdrop: null,
	name: null,
	year: null,
	overview: null,
	genres: [],
	cast: [],
	crew: [],
	similar: [],
	runtimeMinutes: null,
	status: null,
	seasons: null,
});

const sampleMeta = (overrides: Partial<TmdbMeta> = {}): TmdbMeta => ({
	kind: "films",
	poster: "https://image.tmdb.org/t/p/w500/poster.jpg",
	backdrop: null,
	name: "Inception",
	year: 2010,
	overview: "A thief who steals secrets.",
	genres: ["Action", "Sci-Fi"],
	cast: [
		{
			id: 6193,
			name: "Leonardo DiCaprio",
			character: "Cobb",
			profileUrl: null,
		},
	],
	crew: [{ name: "Christopher Nolan", job: "Director" }],
	similar: [],
	runtimeMinutes: 148,
	status: null,
	seasons: null,
	voteAverage: 8.4,
	voteCount: 30_000,
	...overrides,
});

const stubRatings = (): TitleRating[] => [
	{ source: "tmdb", status: "unavailable" },
	{ source: "imdb", status: "unconfigured" },
	{ source: "kinopoisk", status: "unconfigured" },
];

function deps(overrides: Partial<TitleDeps> = {}): TitleDeps {
	return {
		fetchTmdbMeta: async () => ({ status: "unavailable" }),
		getRatings: async () => stubRatings(),
		searchTorrents: async () => ({
			status: "degraded",
			local: [],
			trackerError: "unavailable",
		}),
		listTaggedTorrents: async () => [],
		addFromTracker: async () => {},
		loadWatchByTopicUrl: async () => null,
		loadWatchByTitleId: async () => null,
		saveWatch: async () => {},
		listQbTorrents: async () => [],
		now: () => "2026-08-02T00:00:00.000Z",
		enqueueWatchTask: async (input) => ({
			id: "task-1",
			topicUrl: input.topicUrl,
			titleId: input.titleId,
			trigger: input.trigger,
			status: "pending",
			error: null,
			createdAt: "2026-08-02T00:00:00.000Z",
			startedAt: null,
			finishedAt: null,
		}),
		processWatchTask: async () => ({ outcome: "not_found" }),
		upsertLink: async () => {},
		loadAllLinks: async () => ({}),
		listTitledWatches: async () => [],
		...overrides,
	};
}

describe("title.resolve", () => {
	test("tmdb film ref resolves to deterministic id", () => {
		const title = createTitleModule(deps());

		expect(title.resolve({ type: "tmdb", kind: "films", tmdbId: 123 })).toEqual(
			{ id: "tmdb:films:123" },
		);
	});

	test("tmdb tv ref resolves to deterministic id", () => {
		const title = createTitleModule(deps());

		expect(title.resolve({ type: "tmdb", kind: "tv", tmdbId: 456 })).toEqual({
			id: "tmdb:tv:456",
		});
	});

	test("topic ref resolves to stable base64url id", () => {
		const title = createTitleModule(deps());
		const topicUrl = "https://rutracker.org/forum/viewtopic.php?t=100";

		expect(title.resolve({ type: "topic", topicUrl })).toEqual({
			id: `topic:${encodeTopicUrl(topicUrl)}`,
		});
	});

	test("qb hash ref resolves to stable id", () => {
		const title = createTitleModule(deps());

		expect(title.resolve({ type: "qb", hash: "abc123def456" })).toEqual({
			id: "qb:abc123def456",
		});
	});
});

describe("title.get", () => {
	test("returns meta from injected fetchTmdbMeta", async () => {
		const meta = sampleMeta();
		const title = createTitleModule(
			deps({
				fetchTmdbMeta: async (kind, tmdbId) => {
					expect(kind).toBe("films");
					expect(tmdbId).toBe(27205);
					return { status: "ok", meta };
				},
				getRatings: async (ctx) => {
					expect(ctx.titleId).toBe("tmdb:films:27205");
					expect(ctx.tmdbKind).toBe("films");
					expect(ctx.tmdbId).toBe(27205);
					expect(ctx.tmdbVoteAverage).toBe(8.4);
					return [
						{
							source: "tmdb",
							status: "ok",
							value: 8.4,
							voteCount: 30_000,
						},
						{ source: "imdb", status: "unconfigured" },
						{ source: "kinopoisk", status: "unconfigured" },
					];
				},
			}),
		);

		const result = await title.get({ id: "tmdb:films:27205" });

		expect(result).toEqual({
			id: "tmdb:films:27205",
			facet: "films",
			metaStatus: "ok",
			meta: {
				poster: meta.poster,
				backdrop: meta.backdrop,
				name: meta.name,
				year: meta.year,
				overview: meta.overview,
				genres: meta.genres,
				cast: meta.cast,
				crew: meta.crew,
				similar: meta.similar,
				runtimeMinutes: meta.runtimeMinutes,
				status: meta.status,
				seasons: meta.seasons,
			},
			ratings: [
				{
					source: "tmdb",
					status: "ok",
					value: 8.4,
					voteCount: 30_000,
				},
				{ source: "imdb", status: "unconfigured" },
				{ source: "kinopoisk", status: "unconfigured" },
			],
			watch: null,
		});
	});

	test("ratings always include tmdb, imdb, and kinopoisk slots", async () => {
		const title = createTitleModule(
			deps({
				fetchTmdbMeta: async () => ({
					status: "ok",
					meta: sampleMeta({ voteAverage: null, voteCount: null }),
				}),
				getRatings: async () => [
					{ source: "tmdb", status: "unavailable" },
					{ source: "imdb", status: "unconfigured" },
					{ source: "kinopoisk", status: "unconfigured" },
				],
			}),
		);

		const result = await title.get({ id: "tmdb:films:1" });

		expect(result.ratings).toHaveLength(3);
		expect(result.ratings.map((r) => r.source)).toEqual([
			"tmdb",
			"imdb",
			"kinopoisk",
		]);
		expect(result.ratings[1]).toEqual({
			source: "imdb",
			status: "unconfigured",
		});
		expect(result.ratings[2]).toEqual({
			source: "kinopoisk",
			status: "unconfigured",
		});
	});

	test("fetch failure returns degraded meta without throwing", async () => {
		const title = createTitleModule(
			deps({
				fetchTmdbMeta: async (): Promise<FetchTmdbMetaOutcome> => ({
					status: "error",
				}),
			}),
		);

		await expect(title.get({ id: "tmdb:films:999" })).resolves.toEqual({
			id: "tmdb:films:999",
			facet: "films",
			metaStatus: "degraded",
			meta: emptyMeta(),
			ratings: stubRatings(),
			watch: null,
		});
	});

	test("topic id without tmdb returns empty meta", async () => {
		const topicUrl = "https://rutracker.org/forum/viewtopic.php?t=42";
		const id = `topic:${encodeTopicUrl(topicUrl)}`;
		const title = createTitleModule(deps());

		const fetchTmdbMeta = async () => {
			throw new Error("fetchTmdbMeta should not be called for topic ids");
		};

		const result = await title.get({ id });

		expect(result).toEqual({
			id,
			facet: null,
			metaStatus: "empty",
			meta: emptyMeta(),
			ratings: stubRatings(),
			watch: null,
		});
		await expect(fetchTmdbMeta()).rejects.toThrow();
	});

	test("qb id without tmdb returns empty meta", async () => {
		const title = createTitleModule(deps());

		const result = await title.get({ id: "qb:deadbeef" });

		expect(result).toEqual({
			id: "qb:deadbeef",
			facet: null,
			metaStatus: "empty",
			meta: emptyMeta(),
			ratings: stubRatings(),
			watch: null,
		});
	});

	test("tv tmdb id uses tv facet and fetch kind", async () => {
		const title = createTitleModule(
			deps({
				fetchTmdbMeta: async (kind: TitleKind, tmdbId: number) => {
					expect(kind).toBe("tv");
					expect(tmdbId).toBe(1399);
					return {
						status: "ok",
						meta: sampleMeta({
							kind: "tv",
							name: "Game of Thrones",
							year: 2011,
						}),
					};
				},
			}),
		);

		const result = await title.get({ id: "tmdb:tv:1399" });

		expect(result.facet).toBe("tv");
		expect(result.meta.name).toBe("Game of Thrones");
		expect(result.metaStatus).toBe("ok");
	});
});

describe("title.add and title links", () => {
	test("add() stores topic link for films with titleId", async () => {
		const upsertedLinks: Array<{ key: string; titleId: string }> = [];
		const title = createTitleModule(
			deps({
				upsertLink: async (key, titleId) => {
					upsertedLinks.push({ key, titleId });
				},
				addFromTracker: async () => {},
			}),
		);

		const topicUrl = "https://rutracker.org/forum/viewtopic.php?t=12345";
		await title.add({
			torrentFileUrl: topicUrl,
			kind: "films",
			topicUrl,
			titleId: "tmdb:films:550",
		});

		expect(upsertedLinks).toEqual([
			{ key: "topic:rutracker:12345", titleId: "tmdb:films:550" },
		]);
	});

	test("add() stores topic link for tv with titleId", async () => {
		const upsertedLinks: Array<{ key: string; titleId: string }> = [];
		const title = createTitleModule(
			deps({
				upsertLink: async (key, titleId) => {
					upsertedLinks.push({ key, titleId });
				},
				addFromTracker: async () => {},
			}),
		);

		const topicUrl = "https://rutracker.org/forum/viewtopic.php?t=99999";
		await title.add({
			torrentFileUrl: topicUrl,
			kind: "tv",
			topicUrl,
			titleId: "tmdb:tv:1399",
		});

		expect(upsertedLinks).toEqual([
			{ key: "topic:rutracker:99999", titleId: "tmdb:tv:1399" },
		]);
	});

	test("add() does not create link without titleId", async () => {
		const upsertedLinks: Array<{ key: string; titleId: string }> = [];
		const title = createTitleModule(
			deps({
				upsertLink: async (key, titleId) => {
					upsertedLinks.push({ key, titleId });
				},
				addFromTracker: async () => {},
			}),
		);

		const topicUrl = "https://rutracker.org/forum/viewtopic.php?t=12345";
		await title.add({
			torrentFileUrl: topicUrl,
			kind: "films",
			topicUrl,
		});

		expect(upsertedLinks).toHaveLength(0);
	});
});

describe("title.transferLinks", () => {
	test("transferLinks returns manual link with priority 1", async () => {
		const title = createTitleModule(
			deps({
				loadAllLinks: async () => ({
					"qb:abc123": "tmdb:films:123",
					"topic:rutracker:12345": "tmdb:films:456",
				}),
				listTaggedTorrents: async () => [
					{
						hash: "abc123",
						progress: 100,
						stateKind: "completed",
						stateLabel: "Completed",
						downloadSpeed: 0,
						etaSeconds: 0,
						tags: "brotracker:topic:rutracker:12345",
					},
				],
			}),
		);

		const result = await title.transferLinks();

		expect(result.links.abc123).toBe("tmdb:films:123");
	});

	test("transferLinks returns topic link when no manual link", async () => {
		const title = createTitleModule(
			deps({
				loadAllLinks: async () => ({
					"topic:rutracker:12345": "tmdb:films:456",
				}),
				listTaggedTorrents: async () => [
					{
						hash: "def456",
						progress: 50,
						stateKind: "downloading",
						stateLabel: "Downloading",
						downloadSpeed: 1000000,
						etaSeconds: 3600,
						tags: "brotracker:topic:rutracker:12345",
					},
				],
			}),
		);

		const result = await title.transferLinks();

		expect(result.links.def456).toBe("tmdb:films:456");
	});

	test("transferLinks falls back to a TitleWatch by qB hash or Topic", async () => {
		const title = createTitleModule(
			deps({
				loadAllLinks: async () => ({}),
				listTitledWatches: async () => [
					{
						topicUrl: "https://rutracker.org/forum/viewtopic.php?t=111",
						titleId: "tmdb:tv:1",
						qbHash: "byhash",
					},
					{
						topicUrl: "https://rutracker.org/forum/viewtopic.php?t=222",
						titleId: "tmdb:tv:2",
						qbHash: null,
					},
				],
				listTaggedTorrents: async () => [
					{
						hash: "byhash",
						progress: 1,
						stateKind: "uploading",
						stateLabel: "",
						downloadSpeed: 0,
						etaSeconds: 0,
						tags: "",
					},
					{
						hash: "bytopic",
						progress: 1,
						stateKind: "uploading",
						stateLabel: "",
						downloadSpeed: 0,
						etaSeconds: 0,
						tags: "brotracker:topic:222",
					},
				],
			}),
		);

		const result = await title.transferLinks();

		expect(result.links).toEqual({ byhash: "tmdb:tv:1", bytopic: "tmdb:tv:2" });
	});

	test("transferLinks prefers a recorded link over a TitleWatch", async () => {
		const title = createTitleModule(
			deps({
				loadAllLinks: async () => ({ "qb:h": "tmdb:tv:manual" }),
				listTitledWatches: async () => [
					{
						topicUrl: "https://rutracker.org/forum/viewtopic.php?t=1",
						titleId: "tmdb:tv:watch",
						qbHash: "h",
					},
				],
				listTaggedTorrents: async () => [
					{
						hash: "h",
						progress: 1,
						stateKind: "uploading",
						stateLabel: "",
						downloadSpeed: 0,
						etaSeconds: 0,
						tags: "",
					},
				],
			}),
		);

		expect((await title.transferLinks()).links).toEqual({
			h: "tmdb:tv:manual",
		});
	});

	test("transferLinks returns empty object when no links", async () => {
		const title = createTitleModule(
			deps({
				loadAllLinks: async () => ({}),
				listTaggedTorrents: async () => [
					{
						hash: "ghi789",
						progress: 0,
						stateKind: "allocating",
						stateLabel: "Allocating",
						downloadSpeed: 0,
						etaSeconds: 0,
						tags: "",
					},
				],
			}),
		);

		const result = await title.transferLinks();

		expect(result.links).toEqual({});
	});
});

describe("title.linkTransfer", () => {
	test("linkTransfer accepts tmdb: titleIds", async () => {
		const upsertedLinks: Array<{ key: string; titleId: string }> = [];
		const title = createTitleModule(
			deps({
				upsertLink: async (key, titleId) => {
					upsertedLinks.push({ key, titleId });
				},
			}),
		);

		const result = await title.linkTransfer({
			hash: "abc123def456",
			titleId: "tmdb:films:550",
		});

		expect(result).toEqual({ ok: true });
		expect(upsertedLinks).toHaveLength(1);
		expect(upsertedLinks[0]).toEqual({
			key: "qb:abc123def456",
			titleId: "tmdb:films:550",
		});
	});

	test("linkTransfer rejects non-tmdb titleIds", async () => {
		const title = createTitleModule(deps());

		await expect(
			title.linkTransfer({
				hash: "abc123def456",
				titleId: "topic:some-topic",
			}),
		).rejects.toBeInstanceOf(TitleLinkError);
	});
});
