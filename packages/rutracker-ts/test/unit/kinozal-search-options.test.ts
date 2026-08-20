import { describe, expect, test } from "bun:test";
import {
	createSearchOptions,
	filmsCategory,
	tvCategory,
} from "../../src/tracker/search-engine/kinozal/search-options";

describe("kinozal createSearchOptions", () => {
	test("searches all sections when category is omitted", () => {
		const params = createSearchOptions("История игрушек", {
			sortType: "leechesCount",
			sortOrder: "descending",
		});
		expect(params.s).toBe("История игрушек");
		expect(params.c).toBeUndefined();
	});

	test("films uses the movies aggregate", () => {
		const params = createSearchOptions("Матрица", { category: "films" });
		expect(params.c).toBe(filmsCategory);
	});

	test("tv uses the TV aggregate", () => {
		const params = createSearchOptions("Andor", { category: "tv" });
		expect(params.c).toBe(tvCategory);
	});
});
