import { describe, expect, test } from "bun:test";
import { parsePersonCredits, parsePersonDetails } from "./tmdb-person";

describe("parsePersonDetails", () => {
	test("maps all fields and builds profile url", () => {
		const result = parsePersonDetails({
			name: "Leonardo DiCaprio",
			biography: "  An actor.  ",
			birthday: "1974-11-11",
			deathday: null,
			place_of_birth: "Los Angeles",
			known_for_department: "Acting",
			profile_path: "/abc.jpg",
		});

		expect(result).toEqual({
			name: "Leonardo DiCaprio",
			biography: "An actor.",
			birthday: "1974-11-11",
			deathday: null,
			placeOfBirth: "Los Angeles",
			knownForDepartment: "Acting",
			profileUrl: "https://image.tmdb.org/t/p/h632/abc.jpg",
		});
	});

	test("treats blank strings as null", () => {
		const result = parsePersonDetails({
			name: "X",
			biography: "",
			birthday: null,
			deathday: undefined,
			place_of_birth: null,
			known_for_department: null,
			profile_path: null,
		});

		expect(result.biography).toBeNull();
		expect(result.deathday).toBeNull();
		expect(result.profileUrl).toBeNull();
	});
});

describe("parsePersonCredits", () => {
	test("skips credits without id or name, maps kinds", () => {
		const result = parsePersonCredits({
			cast: [
				{
					id: 27205,
					media_type: "movie",
					title: "Inception",
					character: "Cobb",
					release_date: "2010-07-16",
					vote_average: 8.36,
				},
				{
					id: 1396,
					media_type: "tv",
					name: "Breaking Bad",
					first_air_date: "2008-01-20",
					poster_path: "/gg.jpg",
				},
				{ media_type: "movie", title: "No id" },
				{ id: 5, media_type: "movie", title: "   " },
			],
		});

		expect(result).toHaveLength(2);
		expect(result[0]).toMatchObject({
			titleId: "tmdb:films:27205",
			kind: "films",
			name: "Inception",
			character: "Cobb",
			year: 2010,
			rating: 8.4,
			poster: null,
		});
		expect(result[1]).toMatchObject({
			titleId: "tmdb:tv:1396",
			kind: "tv",
			name: "Breaking Bad",
			year: 2008,
			rating: null,
			poster: "https://image.tmdb.org/t/p/w342/gg.jpg",
		});
	});

	test("sorts by year desc and dedupes by titleId with cap of 24", () => {
		const cast = Array.from({ length: 30 }, (_, i) => ({
			id: i + 1,
			media_type: "movie",
			title: `T${i + 1}`,
			release_date: `${2020 - i}-01-01`,
		}));

		const result = parsePersonCredits({ cast });

		expect(result).toHaveLength(24);
		expect(result[0]?.year).toBe(2020);
		const ids = result.map((c) => c.titleId);
		expect(new Set(ids).size).toBe(ids.length);

		const dup = parsePersonCredits({
			cast: [
				{ id: 1, media_type: "movie", title: "A", release_date: "2020-01-01" },
				{ id: 1, media_type: "movie", title: "A", release_date: "2019-01-01" },
			],
		});
		expect(dup).toHaveLength(1);
	});

	test("returns empty array for missing cast", () => {
		expect(parsePersonCredits(null)).toEqual([]);
		expect(parsePersonCredits({})).toEqual([]);
	});
});
