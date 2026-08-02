import { describe, expect, test } from "bun:test";
import { isCompletePack, parseEpisodeProgress } from "./episode-progress";

describe("parseEpisodeProgress", () => {
	test("parses a range progress pattern", () => {
		expect(
			parseEpisodeProgress("Сериал. S02. 1-8 из 10. WEB-DL 1080p"),
		).toEqual({ have: 8, total: 10 });
	});

	test("parses a bracketed complete pack", () => {
		expect(parseEpisodeProgress("Something [10 из 10] 1080p")).toEqual({
			have: 10,
			total: 10,
		});
	});

	test("parses a slash-delimited single-number progress", () => {
		expect(parseEpisodeProgress("Name / 08 из 12 /")).toEqual({
			have: 8,
			total: 12,
		});
	});

	test("parses a parenthesized range", () => {
		expect(parseEpisodeProgress("Show (1-10 из 10) 720p")).toEqual({
			have: 10,
			total: 10,
		});
	});

	test("returns null when there is no N/M pattern", () => {
		expect(parseEpisodeProgress("Show S01 WEB-DL 1080p")).toBeNull();
	});

	test("returns null for empty string", () => {
		expect(parseEpisodeProgress("")).toBeNull();
	});

	test("never throws on garbage input", () => {
		expect(() => parseEpisodeProgress("из из из 1-2-3 из")).not.toThrow();
	});

	test("is case-insensitive on the Cyrillic connector", () => {
		expect(parseEpisodeProgress("Show 5 ИЗ 12")).toEqual({
			have: 5,
			total: 12,
		});
	});
});

describe("isCompletePack", () => {
	test("true when have === total", () => {
		expect(isCompletePack("Show [10 из 10]")).toBe(true);
	});

	test("false when have < total", () => {
		expect(isCompletePack("Show. 1-8 из 10.")).toBe(false);
	});

	test("false when the name has no parseable progress", () => {
		expect(isCompletePack("Show S01 WEB-DL")).toBe(false);
	});
});
