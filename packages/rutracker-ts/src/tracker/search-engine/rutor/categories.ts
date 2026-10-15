import type { SearchOptions } from "../../tracker-interface";

/** RuTor categories (the `category` select on rutor.info/search). */
export const RUTOR_CATEGORIES = {
	foreignFilms: 1,
	russianFilms: 5,
	foreignSeries: 4,
	russianSeries: 16,
} as const;

/**
 * Kept to four in total: each is a separate request and RuTor bans bursts
 * (see pacing.ts).
 */
export const filmsCategories: number[] = [
	RUTOR_CATEGORIES.foreignFilms,
	RUTOR_CATEGORIES.russianFilms,
];

export const tvCategories: number[] = [
	RUTOR_CATEGORIES.foreignSeries,
	RUTOR_CATEGORIES.russianSeries,
];

/**
 * RuTor search results don't say which category a release is in, so search
 * each relevant category separately and tag results with it.
 */
export function categoriesFor(
	category: SearchOptions["category"] | undefined,
): number[] {
	if (category === "films") return filmsCategories;
	if (category === "tv") return tvCategories;
	return [...filmsCategories, ...tvCategories];
}

export type MediaType = "films" | "tv";

export function detectMediaType(forumId: string): MediaType | null {
	const id = Number(forumId);
	if (!Number.isFinite(id)) return null;
	if (filmsCategories.includes(id)) return "films";
	if (tvCategories.includes(id)) return "tv";
	return null;
}
