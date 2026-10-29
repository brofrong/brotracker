import { describe, expect, test } from "bun:test";

import { normalizeTitleName, releaseMatchesTitle } from "./release-match";

describe("normalizeTitleName", () => {
	test("lowercases, strips punctuation and collapses whitespace", () => {
		expect(normalizeTitleName("Проект «Конец света»!")).toBe(
			"проект конец света",
		);
	});

	test("folds ё to е and collapses repeated spaces", () => {
		expect(normalizeTitleName("Ёлки  2")).toBe("елки 2");
	});
});

describe("releaseMatchesTitle", () => {
	const odyssey = {
		kind: "films" as const,
		year: 2026,
		names: ["Одиссея", "The Odyssey"],
	};

	test("matches on exact name and exact year", () => {
		expect(
			releaseMatchesTitle(
				{ names: ["Одиссея", "The Odyssey"], year: 2026 },
				odyssey,
			),
		).toBe(true);
	});

	test("matches one year above (films ±1)", () => {
		expect(
			releaseMatchesTitle(
				{ names: ["Одиссея", "The Odyssey"], year: 2027 },
				odyssey,
			),
		).toBe(true);
	});

	test("matches one year below (films ±1)", () => {
		expect(
			releaseMatchesTitle(
				{ names: ["Одиссея", "The Odyssey"], year: 2025 },
				odyssey,
			),
		).toBe(true);
	});

	test("rejects two years above (outside films ±1)", () => {
		expect(
			releaseMatchesTitle(
				{ names: ["Одиссея", "The Odyssey"], year: 2028 },
				odyssey,
			),
		).toBe(false);
	});

	test("rejects a different, unrelated title even with a very old year", () => {
		expect(
			releaseMatchesTitle(
				{
					names: ["Космическая одиссея", "2001: A Space Odyssey"],
					year: 1968,
				},
				odyssey,
			),
		).toBe(false);
	});

	test("rejects a different title even when the year matches", () => {
		expect(
			releaseMatchesTitle(
				{
					names: ["Космическая одиссея", "2001: A Space Odyssey"],
					year: 2026,
				},
				odyssey,
			),
		).toBe(false);
	});

	test("matches when only the original-language name matches", () => {
		expect(
			releaseMatchesTitle({ names: ["The Odyssey"], year: 2026 }, odyssey),
		).toBe(true);
	});

	test("rejects when release year is null, even with a matching name", () => {
		expect(
			releaseMatchesTitle({ names: ["Одиссея"], year: null }, odyssey),
		).toBe(false);
	});

	test("rejects a remake with the same name but a year far outside range", () => {
		const dune = {
			kind: "films" as const,
			year: 2021,
			names: ["Дюна", "Dune"],
		};
		expect(
			releaseMatchesTitle({ names: ["Дюна", "Dune"], year: 1984 }, dune),
		).toBe(false);
	});

	test("matches via an alternate title name, normalized", () => {
		const yolki = {
			kind: "films" as const,
			year: 2014,
			names: ["Елки", "Ёлки 1914"],
		};
		expect(
			releaseMatchesTitle({ names: ["ёлки 1914"], year: 2014 }, yolki),
		).toBe(true);
	});

	test("series: matches a year above with no upper bound", () => {
		const theLastOfUs = {
			kind: "tv" as const,
			year: 2023,
			names: ["Одни из нас", "The Last of Us"],
		};
		expect(
			releaseMatchesTitle({ names: ["Одни из нас"], year: 2025 }, theLastOfUs),
		).toBe(true);
	});

	test("series: matches exactly one year below (first-air year - 1)", () => {
		const theLastOfUs = {
			kind: "tv" as const,
			year: 2023,
			names: ["Одни из нас", "The Last of Us"],
		};
		expect(
			releaseMatchesTitle({ names: ["Одни из нас"], year: 2022 }, theLastOfUs),
		).toBe(true);
	});

	test("series: rejects more than one year below first-air year", () => {
		const theLastOfUs = {
			kind: "tv" as const,
			year: 2023,
			names: ["Одни из нас", "The Last of Us"],
		};
		expect(
			releaseMatchesTitle({ names: ["Одни из нас"], year: 2021 }, theLastOfUs),
		).toBe(false);
	});

	test("matches on name alone when the title year is unknown", () => {
		expect(
			releaseMatchesTitle(
				{ names: ["Одиссея"], year: 1999 },
				{ kind: "films", year: null, names: ["Одиссея"] },
			),
		).toBe(true);
	});

	test("rejects when release year is null even with an unknown title year", () => {
		expect(
			releaseMatchesTitle(
				{ names: ["Одиссея"], year: null },
				{ kind: "films", year: null, names: ["Одиссея"] },
			),
		).toBe(false);
	});
});
