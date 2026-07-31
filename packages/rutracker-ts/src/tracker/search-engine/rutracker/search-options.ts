import type { SearchOptions, SortType } from "../../tracker-interface";

// 807 - video

export const filmsCategories = [
	22, 941, 1666, 376, 106, 7, 187, 2090, 2221, 2091, 2092, 2093, 2200, 1950,
	252, 2540, 934, 505, 212, 2459, 1235, 166, 185, 124, 1543, 709, 1577, 511,
	1493, 93, 905, 101, 100, 877, 1576, 572, 2220, 1670, 2198, 2199, 313, 312,
	1247, 2201, 2339, 140, 194, 718, 775, 1457, 1940, 272, 271, 352, 549, 1213,
	2109, 514, 2097, 4, 84, 2343, 930, 2365, 1900, 2258, 521, 208, 539, 2183, 209,
	484, 822, 181, 921, 815, 816, 1460, 498, 33, 1106, 1105, 599, 1389, 1391,
	2491, 2544, 1642, 1390, 404, 1277, 809, 2484, 1386, 1387, 807,
];

export const tvCategories = [
	9, 81, 920, 80, 1535, 188, 91, 990, 1408, 175, 79, 104, 189, 842, 235, 242,
	819, 1531, 721, 1102, 1120, 1214, 489, 387, 1359, 184, 1171, 1417, 625, 1449,
	273, 504, 372, 110, 121, 507, 536, 1144, 173, 195, 2366, 119, 1803, 266, 193,
	1690, 1459, 1463, 825, 1248, 1288, 1669, 2393, 265, 2406, 2404, 2405, 2370,
	2396, 2398, 1949, 1498, 911, 325, 534, 594, 1301, 607, 1574, 1539, 694, 781,
	704, 1537, 2100, 820, 915, 1242, 717, 1939, 2412, 2102, 807,
];

export const SortTypeMap: Record<(typeof SortType)[number], number> = {
	registrationDate: 1,
	themeName: 2,
	downloadsTimes: 4,
	seedsCount: 10,
	leechesCount: 11,
	fileSize: 7,
};

export type RutrackerSearchOptions = {
	nm: string;
	"f[]"?: number[];
	o?: number;
	s?: number;
};

export function createSearchOptions(
	query: string,
	options: Partial<SearchOptions>,
) {
	const searchOptions: RutrackerSearchOptions = {
		nm: query,
		"f[]": [...tvCategories, ...filmsCategories], // category
		o: SortTypeMap[options?.sortType ?? "downloadsTimes"], // sort type
		s: options?.sortOrder === "ascending" ? 1 : 2, // sort order
	};

	if (options?.category || options?.category === null) {
		if (options.category === null) {
			delete searchOptions["f[]"];
		} else if (options.category === "tv") {
			searchOptions["f[]"] = tvCategories;
		} else if (options.category === "films") {
			searchOptions["f[]"] = filmsCategories;
		}
	}

	if (options?.sortType === null) {
		delete searchOptions.o;
	}

	if (options?.sortOrder === null) {
		delete searchOptions.s;
	}

	return searchOptions;
}
