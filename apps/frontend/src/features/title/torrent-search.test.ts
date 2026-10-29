import { describe, expect, it } from "vitest";

import {
	buildTitleSearchQuery,
	hasDistinctNames,
	loadSearchBy,
	saveSearchBy,
	SEARCH_BY_STORAGE_KEY,
	searchNameFor,
	splitByMatch,
} from "./torrent-search";

describe("hasDistinctNames", () => {
	it("is true when name and originalName differ", () => {
		expect(
			hasDistinctNames({ name: "Одиссея", originalName: "The Odyssey" }),
		).toBe(true);
	});

	it("is false when they differ only by case", () => {
		expect(
			hasDistinctNames({ name: "The Odyssey", originalName: "the odyssey" }),
		).toBe(false);
	});

	it("is false when originalName is missing", () => {
		expect(hasDistinctNames({ name: "Одиссея", originalName: null })).toBe(
			false,
		);
	});

	it("is false when the original name has no Latin or Cyrillic letters (Korean)", () => {
		expect(hasDistinctNames({ name: "Паразиты", originalName: "기생충" })).toBe(
			false,
		);
	});

	it("is false when the original name has no Latin or Cyrillic letters (Japanese)", () => {
		expect(
			hasDistinctNames({
				name: "Унесённые призраками",
				originalName: "千と千尋の神隠し",
			}),
		).toBe(false);
	});

	it("is true for a Latin original that mixes in digits and punctuation", () => {
		expect(
			hasDistinctNames({
				name: "Космическая одиссея",
				originalName: "2001: A Space Odyssey",
			}),
		).toBe(true);
	});
});

describe("searchNameFor", () => {
	const meta = { name: "Одиссея", originalName: "The Odyssey" };

	it("returns the original name for 'original'", () => {
		expect(searchNameFor("original", meta)).toBe("The Odyssey");
	});

	it("returns the local name for 'locale'", () => {
		expect(searchNameFor("locale", meta)).toBe("Одиссея");
	});

	it("falls back to the local name when originalName is missing", () => {
		expect(
			searchNameFor("original", { name: "Одиссея", originalName: null }),
		).toBe("Одиссея");
	});

	it("falls back to the local name for a Korean original", () => {
		expect(
			searchNameFor("original", { name: "Паразиты", originalName: "기생충" }),
		).toBe("Паразиты");
	});

	it("falls back to the local name for a Japanese original", () => {
		expect(
			searchNameFor("original", {
				name: "Унесённые призраками",
				originalName: "千と千尋の神隠し",
			}),
		).toBe("Унесённые призраками");
	});

	it("keeps a Cyrillic original name", () => {
		expect(
			searchNameFor("original", { name: "Brother", originalName: "Брат" }),
		).toBe("Брат");
	});

	it("falls back to the local name for a digits-only original", () => {
		expect(
			searchNameFor("original", {
				name: "Один девять один семь",
				originalName: "1917",
			}),
		).toBe("Один девять один семь");
	});
});

describe("buildTitleSearchQuery", () => {
	const formatSeason = (name: string, season: number) =>
		`${name} сезон ${season}`;

	it("appends the year for a film", () => {
		expect(
			buildTitleSearchQuery({
				name: "The Odyssey",
				year: 2026,
				season: null,
				formatSeason,
			}),
		).toBe("The Odyssey 2026");
	});

	it("omits the year when it is null", () => {
		expect(
			buildTitleSearchQuery({
				name: "The Odyssey",
				year: null,
				season: null,
				formatSeason,
			}),
		).toBe("The Odyssey");
	});

	it("uses the season query and ignores the year", () => {
		expect(
			buildTitleSearchQuery({
				name: "The Odyssey",
				year: 2026,
				season: 2,
				formatSeason,
			}),
		).toBe("The Odyssey сезон 2");
	});
});

describe("splitByMatch", () => {
	it("keeps order inside each group", () => {
		const items = [
			{ id: "a", matches: true },
			{ id: "b", matches: false },
			{ id: "c", matches: true },
			{ id: "d", matches: false },
		];

		expect(splitByMatch(items)).toEqual({
			matched: [
				{ id: "a", matches: true },
				{ id: "c", matches: true },
			],
			others: [
				{ id: "b", matches: false },
				{ id: "d", matches: false },
			],
		});
	});
});

function fakeStorage(initial: Record<string, string> = {}) {
	const store = new Map(Object.entries(initial));
	return {
		getItem: (key: string) => store.get(key) ?? null,
		setItem: (key: string, value: string) => {
			store.set(key, value);
		},
		store,
	};
}

describe("loadSearchBy", () => {
	it("defaults to 'original' when nothing is stored", () => {
		expect(loadSearchBy(fakeStorage())).toBe("original");
	});

	it("defaults to 'original' for a garbage value", () => {
		expect(
			loadSearchBy(fakeStorage({ [SEARCH_BY_STORAGE_KEY]: "garbage" })),
		).toBe("original");
	});

	it("returns 'locale' when stored", () => {
		expect(
			loadSearchBy(fakeStorage({ [SEARCH_BY_STORAGE_KEY]: "locale" })),
		).toBe("locale");
	});
});

describe("saveSearchBy", () => {
	it("writes SEARCH_BY_STORAGE_KEY", () => {
		const storage = fakeStorage();
		saveSearchBy(storage, "locale");
		expect(storage.store.get(SEARCH_BY_STORAGE_KEY)).toBe("locale");
	});
});
