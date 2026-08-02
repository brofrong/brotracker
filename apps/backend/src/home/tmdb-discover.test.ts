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

	test("maps tv trending row to tv title card", () => {
		expect(
			mapTrendingItem({
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
			mapTrendingItem({
				id: 7,
				media_type: "movie",
				title: "Unknown",
				vote_average: 0,
			})?.rating,
		).toBeNull();
		expect(
			mapTrendingItem({
				id: 8,
				media_type: "movie",
				title: "Unknown 2",
			})?.rating,
		).toBeNull();
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
