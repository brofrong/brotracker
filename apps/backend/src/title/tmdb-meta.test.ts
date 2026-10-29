import { describe, expect, test } from "bun:test";

import { parseMovieDetails, parseTvDetails } from "./tmdb-meta";

const credits = () => ({ cast: [], crew: [] });

describe("parseMovieDetails names", () => {
	test("picks original title and RU alternative names, deduped and excluding main/original", () => {
		const result = parseMovieDetails(
			{
				title: "Одиссея",
				original_title: "The Odyssey",
				alternative_titles: {
					titles: [
						{ iso_3166_1: "RU", title: "Одиссей" },
						{ iso_3166_1: "RU", title: "одиссея" },
						{ iso_3166_1: "US", title: "Odyssey" },
					],
				},
				translations: {
					translations: [
						{
							iso_639_1: "ru",
							iso_3166_1: "RU",
							data: { title: "Одиссея Нолана" },
						},
					],
				},
			},
			credits(),
		);

		expect(result.originalName).toBe("The Odyssey");
		expect(result.alternativeNames).toEqual(["Одиссея Нолана", "Одиссей"]);
	});

	test("fetched in English: alternative names use the RU translation, not the English title", () => {
		const result = parseMovieDetails(
			{
				title: "The Odyssey",
				original_title: "The Odyssey",
				alternative_titles: { titles: [] },
				translations: {
					translations: [
						{
							iso_639_1: "ru",
							iso_3166_1: "RU",
							data: { title: "Одиссея" },
						},
					],
				},
			},
			credits(),
		);

		expect(result.alternativeNames).toContain("Одиссея");
		expect(result.alternativeNames).not.toContain("The Odyssey");
	});

	test("missing alternative_titles/translations/original_title yields nulls/empty", () => {
		const result = parseMovieDetails({ title: "Одиссея" }, credits());

		expect(result.originalName).toBeNull();
		expect(result.alternativeNames).toEqual([]);
	});

	test("drops RU alternative titles and translation names that are blank", () => {
		const result = parseMovieDetails(
			{
				title: "The Odyssey",
				original_title: "The Odyssey",
				alternative_titles: {
					titles: [
						{ iso_3166_1: "RU", title: "" },
						{ iso_3166_1: "RU", title: "   " },
						{ iso_3166_1: "RU", title: " Одиссей " },
					],
				},
				translations: {
					translations: [
						{ iso_639_1: "ru", iso_3166_1: "RU", data: { title: "  " } },
					],
				},
			},
			credits(),
		);

		expect(result.alternativeNames).toEqual(["Одиссей"]);
	});
});

describe("parseTvDetails names", () => {
	test("picks original name and RU alternative names, deduped and excluding main/original", () => {
		const result = parseTvDetails(
			{
				name: "Одиссея",
				original_name: "The Odyssey",
				alternative_titles: {
					results: [
						{ iso_3166_1: "RU", title: "Одиссей" },
						{ iso_3166_1: "RU", title: "одиссея" },
						{ iso_3166_1: "US", title: "Odyssey" },
					],
				},
				translations: {
					translations: [
						{
							iso_639_1: "ru",
							iso_3166_1: "RU",
							data: { name: "Одиссея Нолана" },
						},
					],
				},
			},
			credits(),
		);

		expect(result.originalName).toBe("The Odyssey");
		expect(result.alternativeNames).toEqual(["Одиссея Нолана", "Одиссей"]);
	});

	test("fetched in English: alternative names use the RU translation, not the English name", () => {
		const result = parseTvDetails(
			{
				name: "The Odyssey",
				original_name: "The Odyssey",
				alternative_titles: { results: [] },
				translations: {
					translations: [
						{
							iso_639_1: "ru",
							iso_3166_1: "RU",
							data: { name: "Одиссея" },
						},
					],
				},
			},
			credits(),
		);

		expect(result.alternativeNames).toContain("Одиссея");
		expect(result.alternativeNames).not.toContain("The Odyssey");
	});

	test("missing alternative_titles/translations/original_name yields nulls/empty", () => {
		const result = parseTvDetails({ name: "Одиссея" }, credits());

		expect(result.originalName).toBeNull();
		expect(result.alternativeNames).toEqual([]);
	});
});

describe("parseTvDetails season air years", () => {
	test("maps each season number to its air year and keeps the last air year", () => {
		const result = parseTvDetails(
			{
				name: "Офис",
				first_air_date: "2001-07-09",
				last_air_date: "2003-12-27",
				seasons: [
					{ season_number: 0, air_date: "2002-01-01" },
					{ season_number: 1, air_date: "2001-07-09" },
					{ season_number: 2, air_date: "2002-09-30" },
					{ season_number: 3, air_date: null },
					{ season_number: 4 },
				],
			},
			credits(),
		);

		expect(result.seasonAirYears).toEqual({ 0: 2002, 1: 2001, 2: 2002 });
		expect(result.lastAirYear).toBe(2003);
	});

	test("missing seasons/last_air_date -> empty map and null", () => {
		const result = parseTvDetails({ name: "Офис" }, credits());

		expect(result.seasonAirYears).toEqual({});
		expect(result.lastAirYear).toBeNull();
	});

	test("films have no season air years", () => {
		const result = parseMovieDetails({ title: "Одиссея" }, credits());

		expect(result.seasonAirYears).toEqual({});
		expect(result.lastAirYear).toBeNull();
	});
});
