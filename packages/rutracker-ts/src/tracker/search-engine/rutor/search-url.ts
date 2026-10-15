import type { SearchOptions } from "../../tracker-interface";
import { RUTOR_URL } from "./constants";

/** Search the phrase in titles only (rutor's `search_method` 1 + `search_in` 0, encoded as `100`). */
const SEARCH_MODE = "100";

/** Sort select values on rutor.info/search; add 1 for ascending order. */
const SORT_BASE: Partial<
	Record<NonNullable<SearchOptions["sortType"]>, number>
> = {
	registrationDate: 0,
	seedsCount: 2,
	leechesCount: 4,
	themeName: 6,
	fileSize: 8,
};

export function rutorSearchUrl(
	query: string,
	category: number,
	options: Partial<SearchOptions>,
	baseUrl: string = RUTOR_URL,
): string {
	const base = SORT_BASE[options.sortType ?? "seedsCount"] ?? 2;
	const sort = base + (options.sortOrder === "ascending" ? 1 : 0);
	return `${baseUrl}/search/0/${category}/${SEARCH_MODE}/${sort}/${encodeURIComponent(query.trim())}`;
}
