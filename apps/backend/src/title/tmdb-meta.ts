import { yearFromDate } from "../tmdb/dates";
import { normalizeTitleName } from "./release-match";
import type {
	TitleCastMember,
	TitleCrewMember,
	TitleKind,
	TitleSimilarItem,
	TmdbMeta,
} from "./title.types";

const POSTER_BASE = "https://image.tmdb.org/t/p/w500";
const BACKDROP_BASE = "https://image.tmdb.org/t/p/w1280";
const PROFILE_BASE = "https://image.tmdb.org/t/p/w185";

const KEY_CREW_JOBS = new Set([
	"Director",
	"Screenplay",
	"Writer",
	"Creator",
	"Executive Producer",
]);

type TmdbGenre = { id: number; name: string };

type TmdbCastMember = {
	id?: number;
	name: string;
	character?: string;
	profile_path?: string | null;
};

type TmdbCrewMember = {
	name: string;
	job: string;
};

type TmdbAltTitle = {
	iso_3166_1?: string;
	title: string;
};

type TmdbTranslation = {
	iso_639_1?: string;
	iso_3166_1?: string;
	data?: {
		title?: string;
		name?: string;
	};
};

type TmdbMovieDetails = {
	title?: string;
	original_title?: string;
	release_date?: string;
	overview?: string;
	poster_path?: string | null;
	backdrop_path?: string | null;
	genres?: TmdbGenre[];
	runtime?: number | null;
	vote_average?: number;
	vote_count?: number;
	alternative_titles?: { titles?: TmdbAltTitle[] };
	translations?: { translations?: TmdbTranslation[] };
};

type TmdbTvDetails = {
	name?: string;
	original_name?: string;
	first_air_date?: string;
	overview?: string;
	poster_path?: string | null;
	backdrop_path?: string | null;
	genres?: TmdbGenre[];
	status?: string | null;
	number_of_seasons?: number | null;
	vote_average?: number;
	vote_count?: number;
	alternative_titles?: { results?: TmdbAltTitle[] };
	translations?: { translations?: TmdbTranslation[] };
};

type TmdbSimilarEntry = {
	id?: number;
	title?: string;
	name?: string;
	release_date?: string;
	first_air_date?: string;
	poster_path?: string | null;
	vote_average?: number;
};

type TmdbSimilarResponse = {
	results?: TmdbSimilarEntry[];
};

type TmdbCredits = {
	cast?: TmdbCastMember[];
	crew?: TmdbCrewMember[];
};

export function posterUrl(
	posterPath: string | null | undefined,
): string | null {
	if (!posterPath) {
		return null;
	}
	return `${POSTER_BASE}${posterPath}`;
}

export function backdropUrl(
	backdropPath: string | null | undefined,
): string | null {
	if (!backdropPath) {
		return null;
	}
	return `${BACKDROP_BASE}${backdropPath}`;
}

export function profileUrl(
	profilePath: string | null | undefined,
): string | null {
	if (!profilePath) {
		return null;
	}
	return `${PROFILE_BASE}${profilePath}`;
}

export function parseCast(
	cast: TmdbCastMember[] | undefined,
): TitleCastMember[] {
	if (!cast) {
		return [];
	}

	return cast
		.filter((member) => member.id != null)
		.slice(0, 12)
		.map((member) => ({
			id: member.id as number,
			name: member.name,
			character: member.character ?? null,
			profileUrl: profileUrl(member.profile_path),
		}));
}

export function parseKeyCrew(
	crew: TmdbCrewMember[] | undefined,
): TitleCrewMember[] {
	if (!crew) {
		return [];
	}

	const seen = new Set<string>();
	const result: TitleCrewMember[] = [];

	for (const member of crew) {
		if (!KEY_CREW_JOBS.has(member.job)) {
			continue;
		}
		const key = `${member.name}:${member.job}`;
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		result.push({ name: member.name, job: member.job });
		if (result.length >= 8) {
			break;
		}
	}

	return result;
}

export function parseSimilar(
	response: TmdbSimilarResponse | null,
	kind: TitleKind,
): TitleSimilarItem[] {
	if (!response?.results) {
		return [];
	}

	const items: TitleSimilarItem[] = [];
	for (const entry of response.results) {
		if (entry.id == null) {
			continue;
		}
		const name = kind === "films" ? entry.title : entry.name;
		if (!name) {
			continue;
		}
		const date = kind === "films" ? entry.release_date : entry.first_air_date;
		items.push({
			titleId: `tmdb:${kind}:${entry.id}`,
			kind,
			name,
			poster: posterUrl(entry.poster_path),
			year: yearFromDate(date),
			rating:
				entry.vote_average != null && entry.vote_average > 0
					? entry.vote_average
					: null,
		});
		if (items.length >= 12) {
			break;
		}
	}
	return items;
}

/**
 * Russian alternative names: the RU translation title (if any), then RU
 * alternative titles in TMDB order, deduped by normalized form and excluding
 * the main and original names.
 */
export function russianAlternativeNames(input: {
	mainName: string;
	originalName: string | null;
	translationName: string | null;
	altTitles: TmdbAltTitle[];
}): string[] {
	const excluded = new Set(
		[input.mainName, input.originalName]
			.filter((name): name is string => name != null)
			.map(normalizeTitleName),
	);

	const candidates: string[] = [];
	if (input.translationName) {
		candidates.push(input.translationName);
	}
	for (const alt of input.altTitles) {
		if (alt.iso_3166_1 === "RU") {
			candidates.push(alt.title);
		}
	}

	const seen = new Set<string>();
	const result: string[] = [];
	for (const name of candidates) {
		const normalized = normalizeTitleName(name);
		if (excluded.has(normalized) || seen.has(normalized)) {
			continue;
		}
		seen.add(normalized);
		result.push(name);
	}

	return result;
}

export function parseMovieDetails(
	details: TmdbMovieDetails,
	credits: TmdbCredits,
): Omit<TmdbMeta, "similar"> {
	const name = details.title ?? "";
	const originalName = details.original_title ?? null;
	const translationName =
		details.translations?.translations?.find((t) => t.iso_639_1 === "ru")?.data
			?.title ?? null;
	const altTitles = details.alternative_titles?.titles ?? [];

	return {
		kind: "films",
		poster: posterUrl(details.poster_path),
		backdrop: backdropUrl(details.backdrop_path),
		name,
		year: yearFromDate(details.release_date),
		overview: details.overview ?? null,
		genres: (details.genres ?? []).map((g) => g.name),
		cast: parseCast(credits.cast),
		crew: parseKeyCrew(credits.crew),
		runtimeMinutes:
			details.runtime != null && details.runtime > 0 ? details.runtime : null,
		status: null,
		seasons: null,
		originalName,
		alternativeNames: russianAlternativeNames({
			mainName: name,
			originalName,
			translationName,
			altTitles,
		}),
		voteAverage:
			details.vote_average != null && details.vote_average > 0
				? details.vote_average
				: null,
		voteCount:
			details.vote_count != null && details.vote_count > 0
				? details.vote_count
				: null,
	};
}

export function parseTvDetails(
	details: TmdbTvDetails,
	credits: TmdbCredits,
): Omit<TmdbMeta, "similar"> {
	const name = details.name ?? "";
	const originalName = details.original_name ?? null;
	const translationName =
		details.translations?.translations?.find((t) => t.iso_639_1 === "ru")?.data
			?.name ?? null;
	const altTitles = details.alternative_titles?.results ?? [];

	return {
		kind: "tv",
		poster: posterUrl(details.poster_path),
		backdrop: backdropUrl(details.backdrop_path),
		name,
		year: yearFromDate(details.first_air_date),
		overview: details.overview ?? null,
		genres: (details.genres ?? []).map((g) => g.name),
		cast: parseCast(credits.cast),
		crew: parseKeyCrew(credits.crew),
		runtimeMinutes: null,
		status: details.status ?? null,
		seasons:
			details.number_of_seasons != null && details.number_of_seasons > 0
				? details.number_of_seasons
				: null,
		originalName,
		alternativeNames: russianAlternativeNames({
			mainName: name,
			originalName,
			translationName,
			altTitles,
		}),
		voteAverage:
			details.vote_average != null && details.vote_average > 0
				? details.vote_average
				: null,
		voteCount:
			details.vote_count != null && details.vote_count > 0
				? details.vote_count
				: null,
	};
}

export type {
	TmdbCredits,
	TmdbMovieDetails,
	TmdbSimilarResponse,
	TmdbTvDetails,
};
