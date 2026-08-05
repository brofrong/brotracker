import { describe, expect, test } from "bun:test";
import {
	createTmdbBrowse,
	mapBrowseItem,
	type TmdbBrowseItem,
} from "./browse";

describe("mapBrowseItem", () => {
	test("maps movie row to films title card", () => {
		expect(
			mapBrowseItem({
				id: 42,
				media_type: "movie",
				title: "Dune",
				poster_path: "/dune.jpg",
				release_date: "2021-10-22",
				vote_average: 8.36,
			}),
		).toEqual({
			titleId: "tmdb:films:42",
			name: "Dune",
			poster: "https://image.tmdb.org/t/p/w342/dune.jpg",
			year: 2021,
			kind: "films",
			rating: 8.4,
		});
	});

	test("maps tv row to tv title card", () => {
		expect(
			mapBrowseItem({
				id: 1399,
				media_type: "tv",
				name: "Game of Thrones",
				poster_path: null,
				first_air_date: "2011-04-17",
				vote_average: 8.4,
			}),
		).toEqual({
			titleId: "tmdb:tv:1399",
			name: "Game of Thrones",
			poster: null,
			year: 2011,
			kind: "tv",
			rating: 8.4,
		});
	});

	test("treats zero or missing vote average as no rating", () => {
		expect(
			mapBrowseItem({
				id: 7,
				media_type: "movie",
				title: "Unknown",
				vote_average: 0,
			})?.rating,
		).toBeNull();
		expect(
			mapBrowseItem({
				id: 8,
				media_type: "movie",
				title: "Unknown 2",
			})?.rating,
		).toBeNull();
	});

	test("skips non movie/tv media types", () => {
		expect(
			mapBrowseItem({
				id: 1,
				media_type: "person",
				name: "Someone",
			}),
		).toBeNull();
	});
});

describe("createTmdbBrowse", () => {
	const credentials = { apiKey: "test-key", proxyUrl: null as string | null };

	test("returns unavailable when credentials are missing", async () => {
		const browse = createTmdbBrowse({
			resolveCredentials: async () => undefined,
			fetchJson: async () => {
				throw new Error("should not fetch");
			},
		});

		await expect(browse.fetchTrending(1)).resolves.toEqual({
			status: "unavailable",
		});
		await expect(browse.searchMulti("Dune", 1)).resolves.toEqual({
			status: "unavailable",
		});
	});

	test("fetchTrending passes page and returns totalPages", async () => {
		const urls: string[] = [];
		const browse = createTmdbBrowse({
			resolveCredentials: async () => credentials,
			fetchJson: async (url) => {
				urls.push(url);
				return new Response(
					JSON.stringify({
						page: 2,
						total_pages: 5,
						results: [
							{
								id: 1,
								media_type: "movie",
								title: "Film",
								poster_path: null,
								vote_average: 7,
							} satisfies TmdbBrowseItem,
							{
								id: 2,
								media_type: "person",
								name: "Actor",
							} satisfies TmdbBrowseItem,
						],
					}),
					{ status: 200 },
				);
			},
		});

		const outcome = await browse.fetchTrending(2);
		expect(urls[0]).toContain("/trending/all/day?");
		expect(urls[0]).toContain("page=2");
		expect(urls[0]).toContain("api_key=test-key");
		expect(outcome).toEqual({
			status: "ok",
			data: {
				page: 2,
				totalPages: 5,
				items: [
					{
						titleId: "tmdb:films:1",
						name: "Film",
						poster: null,
						year: null,
						kind: "films",
						rating: 7,
					},
				],
			},
		});
	});

	test("searchMulti passes query and page, filters non movie/tv", async () => {
		const urls: string[] = [];
		const browse = createTmdbBrowse({
			resolveCredentials: async () => credentials,
			fetchJson: async (url) => {
				urls.push(url);
				return new Response(
					JSON.stringify({
						page: 1,
						total_pages: 3,
						results: [
							{
								id: 10,
								media_type: "tv",
								name: "Andor",
								first_air_date: "2022-09-21",
								poster_path: "/a.jpg",
								vote_average: 8.2,
							},
							{
								id: 99,
								media_type: "person",
								name: "Someone",
							},
						],
					}),
					{ status: 200 },
				);
			},
		});

		const outcome = await browse.searchMulti("Andor", 1);
		expect(urls[0]).toContain("/search/multi?");
		expect(urls[0]).toContain("query=Andor");
		expect(urls[0]).toContain("page=1");
		expect(outcome).toEqual({
			status: "ok",
			data: {
				page: 1,
				totalPages: 3,
				items: [
					{
						titleId: "tmdb:tv:10",
						name: "Andor",
						poster: "https://image.tmdb.org/t/p/w342/a.jpg",
						year: 2022,
						kind: "tv",
						rating: 8.2,
					},
				],
			},
		});
	});

	test("returns error when TMDB responds non-ok", async () => {
		const browse = createTmdbBrowse({
			resolveCredentials: async () => credentials,
			fetchJson: async () => new Response("nope", { status: 500 }),
		});

		await expect(browse.fetchTrending(1)).resolves.toEqual({
			status: "error",
		});
	});
});
