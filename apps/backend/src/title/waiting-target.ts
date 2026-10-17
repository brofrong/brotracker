import type { Title } from "./title.types";
import type { WaitingTarget } from "./waiting-search";
import type { TitleWatchRecord } from "./watch/check-topic-now";

const LATIN_OR_CYRILLIC_LETTER = /[\p{Script=Latin}\p{Script=Cyrillic}]/u;

/**
 * The original name when it can be searched on the trackers. Release titles
 * there are Latin/Cyrillic, so an original in Korean, Japanese, Hindi, ... (no
 * Latin or Cyrillic letter at all) finds nothing. Mirrors the frontend's
 * `searchableOriginalName` (features/title/torrent-search.ts).
 */
export function searchableOriginalName(meta: {
	originalName: string | null;
}): string | null {
	const originalName = meta.originalName?.trim();
	if (!originalName || !LATIN_OR_CYRILLIC_LETTER.test(originalName)) {
		return null;
	}
	return originalName;
}

/**
 * What the waiting search looks for: the Title's names for the Release match
 * and tracker queries for the searchable original and the Russian name.
 */
export function buildWaitingTarget(
	title: Title,
	watch: TitleWatchRecord,
): WaitingTarget | null {
	if (!title.facet) {
		return null;
	}
	const { meta } = title;
	const names = [meta.name, meta.originalName, ...meta.alternativeNames]
		.map((name) => name?.trim())
		.filter((name): name is string => Boolean(name));
	if (names.length === 0) {
		return null;
	}

	const season = title.facet === "tv" ? (watch.season ?? meta.seasons) : null;
	// A season not (yet) listed with an air date falls back to the last air year.
	const seasonYear =
		season === null ? null : (meta.seasonAirYears[season] ?? meta.lastAirYear);
	const searchNames: string[] = [];
	for (const name of [searchableOriginalName(meta), meta.name?.trim()]) {
		if (
			name &&
			!searchNames.some((seen) => seen.toLowerCase() === name.toLowerCase())
		) {
			searchNames.push(name);
		}
	}

	const queries = searchNames.flatMap((name) => {
		if (title.facet === "tv") {
			return season === null ? [name] : [`${name} сезон ${season}`];
		}
		return meta.year === null ? [name] : [`${name} ${meta.year}`, name];
	});

	return {
		kind: title.facet,
		year: meta.year,
		names,
		season,
		seasonYear,
		queries,
	};
}
