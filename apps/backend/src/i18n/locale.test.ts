import { describe, expect, test } from "bun:test";
import { parseAppLocale, toTmdbLanguage } from "./locale";

describe("parseAppLocale", () => {
	test("accepts ru and en", () => {
		expect(parseAppLocale("ru")).toBe("ru");
		expect(parseAppLocale("en")).toBe("en");
	});

	test("defaults unknown values to ru", () => {
		expect(parseAppLocale(undefined)).toBe("ru");
		expect(parseAppLocale("fr")).toBe("ru");
		expect(parseAppLocale(["en", "ru"])).toBe("en");
	});
});

describe("toTmdbLanguage", () => {
	test("maps app locales to TMDB language tags", () => {
		expect(toTmdbLanguage("ru")).toBe("ru-RU");
		expect(toTmdbLanguage("en")).toBe("en-US");
	});
});
