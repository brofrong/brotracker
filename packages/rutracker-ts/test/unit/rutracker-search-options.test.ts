import { describe, expect, test } from "bun:test";
import { toWindows1251Query } from "../../src/tracker/windows-1251-query";
import {
	createSearchOptions,
	filmsCategories,
	tvCategories,
} from "../../src/tracker/search-engine/rutracker/search-options";

describe("rutracker createSearchOptions", () => {
	test("omits forum filter when category is omitted (Catalog UI path)", () => {
		const params = createSearchOptions("Интерстеллар", {
			sortType: "leechesCount",
			sortOrder: "descending",
		});
		expect(params.nm).toBe("Интерстеллар");
		expect(params.f).toBeUndefined();
		expect("f[]" in params).toBe(false);
		expect(params.o).toBe(11);
		expect(params.s).toBe(2);
	});

	test("omits forum filter when category is null", () => {
		const params = createSearchOptions("Во все тяжкие", { category: null });
		expect(params.f).toBeUndefined();
		expect("f[]" in params).toBe(false);
	});

	test("films uses comma-separated f, matching tracker.php", () => {
		const params = createSearchOptions("Матрица", { category: "films" });
		expect(params.f).toBe([...filmsCategories].sort((a, b) => a - b).join(","));
		expect("f[]" in params).toBe(false);
	});

	test("tv uses comma-separated f, matching tracker.php", () => {
		const params = createSearchOptions("Во все тяжкие", { category: "tv" });
		expect(params.f).toBe([...tvCategories].sort((a, b) => a - b).join(","));
		expect("f[]" in params).toBe(false);
	});

	test("axios URL keeps windows-1251 nm without f[] spam", () => {
		const params = createSearchOptions("История игрушек", {
			sortType: "leechesCount",
			sortOrder: "descending",
		});
		const query = toWindows1251Query(params);
		expect(query).toContain("nm=%C8%F1%F2%EE%F0%E8%FF+%E8%E3%F0%F3%F8%E5%EA");
		expect(query).not.toContain("f%5B%5D");
		expect(query).not.toContain("f[]");
	});
});
