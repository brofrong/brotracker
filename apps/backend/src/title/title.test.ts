import { describe, expect, test } from "bun:test";
import {
	createTitleModule,
	encodeTopicUrl,
	type TitleDeps,
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
	name: null,
	year: null,
	overview: null,
	genres: [],
	cast: [],
	crew: [],
	runtimeMinutes: null,
	status: null,
	seasons: null,
});

const sampleMeta = (overrides: Partial<TmdbMeta> = {}): TmdbMeta => ({
	kind: "films",
	poster: "https://image.tmdb.org/t/p/w500/poster.jpg",
	name: "Inception",
	year: 2010,
	overview: "A thief who steals secrets.",
	genres: ["Action", "Sci-Fi"],
	cast: [{ name: "Leonardo DiCaprio", character: "Cobb", profileUrl: null }],
	crew: [{ name: "Christopher Nolan", job: "Director" }],
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

function deps(
	overrides: Partial<TitleDeps> = {},
): TitleDeps {
	return {
		fetchTmdbMeta: async () => ({ status: "unavailable" }),
		getRatings: async () => stubRatings(),
		searchLocal: async () => [],
		searchTracker: async () => ({ status: "unavailable" }),
		listTaggedTorrents: async () => [],
		addFromTracker: async () => {},
		loadWatchByTopicUrl: async () => null,
		loadWatchByTitleId: async () => null,
		saveWatch: async () => {},
		listQbTorrents: async () => [],
		getSeriesPath: async () => null,
		fetchTorrentBytes: async () => new Uint8Array(),
		fetchTopicMeta: async () => ({
			size: 0,
			registeredAt: null,
			torrentFileUrl: "https://rutracker.org/forum/dl.php?t=1",
		}),
		replaceInQb: async () => {},
		isCompletePack: () => false,
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
		...overrides,
	};
}

describe("title.resolve", () => {
	test("tmdb film ref resolves to deterministic id", () => {
		const title = createTitleModule(deps());

		expect(
			title.resolve({ type: "tmdb", kind: "films", tmdbId: 123 }),
		).toEqual({ id: "tmdb:films:123" });
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

		expect(
			title.resolve({ type: "qb", hash: "abc123def456" }),
		).toEqual({ id: "qb:abc123def456" });
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
				name: meta.name,
				year: meta.year,
				overview: meta.overview,
				genres: meta.genres,
				cast: meta.cast,
				crew: meta.crew,
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
