import { describe, expect, test } from "bun:test";
import { mapTrendingItem } from "./tmdb-discover";

describe("mapTrendingItem", () => {
	test("maps movie trending row to films title card", () => {
		expect(
			mapTrendingItem({
				id: 42,
				media_type: "movie",
				title: "Dune",
				poster_path: "/dune.jpg",
				release_date: "2021-10-22",
			}),
		).toEqual({
			titleId: "tmdb:films:42",
			name: "Dune",
			poster: "https://image.tmdb.org/t/p/w342/dune.jpg",
			year: 2021,
			kind: "films",
		});
	});

	test("maps tv trending row to tv title card", () => {
		expect(
			mapTrendingItem({
				id: 1399,
				media_type: "tv",
				name: "Game of Thrones",
				poster_path: null,
				first_air_date: "2011-04-17",
			}),
		).toEqual({
			titleId: "tmdb:tv:1399",
			name: "Game of Thrones",
			poster: null,
			year: 2011,
			kind: "tv",
		});
	});

	test("skips non movie/tv media types", () => {
		expect(
			mapTrendingItem({
				id: 1,
				media_type: "person",
				name: "Someone",
			}),
		).toBeNull();
	});
});
