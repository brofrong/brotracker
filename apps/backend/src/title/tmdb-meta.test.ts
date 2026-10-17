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
