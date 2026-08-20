import type { SearchOptions } from "../../tracker-interface";

/** Aggregate: all films (does not include cartoons). */
export const filmsCategory = 1002;

/** Aggregate: all cartoons. */
export const cartoonsCategory = 1003;

/** Aggregate: all TV series. */
export const tvCategory = 1001;

export const filmsCategories = [
	1002, 8, 6, 15, 17, 35, 39, 13, 14, 24, 11, 10, 9, 47, 18, 37, 12, 7, 48, 49,
	50, 38, 16, 21, 22, 20, 1003,
];

export const tvCategories = [1001, 45, 46];

export type KinozalSearchParams = {
	s: string;
	c?: number;
	t?: number;
	f?: number;
};

export function createSearchOptions(
	query: string,
	options: Partial<SearchOptions>,
): KinozalSearchParams {
	const params: KinozalSearchParams = {
		s: query,
	};

	if (options?.category === "tv") {
		params.c = tvCategory;
	} else if (options?.category === "films") {
		params.c = filmsCategory;
	}

	if (options?.sortType === "seedsCount") {
		params.t = 1;
	} else if (options?.sortType === "leechesCount") {
		params.t = 2;
	} else if (options?.sortType === "fileSize") {
		params.t = 3;
	} else if (options?.sortType === "registrationDate") {
		params.t = 0;
	}

	if (options?.sortOrder === "ascending") {
		params.f = 1;
	} else if (options?.sortOrder === "descending") {
		params.f = 0;
	}

	return params;
}
