export type SearchBy = "original" | "locale";

export const SEARCH_BY_STORAGE_KEY = "brotracker.title.searchBy";

type TitleNames = {
	name: string | null;
	originalName: string | null;
};

/** Whether the original name differs from the local name (worth offering a toggle). */
export function hasDistinctNames(meta: TitleNames): boolean {
	const name = meta.name?.trim();
	const originalName = meta.originalName?.trim();
	if (!name || !originalName) {
		return false;
	}
	return name.toLowerCase() !== originalName.toLowerCase();
}

/** Picks the name to search by, falling back to the local name when the original is unavailable. */
export function searchNameFor(by: SearchBy, meta: TitleNames): string {
	if (by === "original") {
		const originalName = meta.originalName?.trim();
		if (originalName) {
			return meta.originalName as string;
		}
	}
	return meta.name ?? "";
}

/** Builds the initial torrent search query: season query for TV, name + year for films. */
export function buildTitleSearchQuery(input: {
	name: string;
	year: number | null;
	season: number | null;
	formatSeason: (name: string, season: number) => string;
}): string {
	const trimmed = input.name.trim();
	if (!trimmed) {
		return "";
	}
	if (input.season != null) {
		return input.formatSeason(trimmed, input.season);
	}
	if (input.year != null) {
		return `${trimmed} ${input.year}`;
	}
	return trimmed;
}

/** Splits torrent results into ones that match the title and ones that may belong to a different title. */
export function splitByMatch<T extends { matches: boolean }>(
	items: T[],
): { matched: T[]; others: T[] } {
	const matched: T[] = [];
	const others: T[] = [];
	for (const item of items) {
		if (item.matches) {
			matched.push(item);
		} else {
			others.push(item);
		}
	}
	return { matched, others };
}

export function loadSearchBy(storage: Pick<Storage, "getItem">): SearchBy {
	const value = storage.getItem(SEARCH_BY_STORAGE_KEY);
	return value === "locale" ? "locale" : "original";
}

export function saveSearchBy(
	storage: Pick<Storage, "setItem">,
	by: SearchBy,
): void {
	storage.setItem(SEARCH_BY_STORAGE_KEY, by);
}
