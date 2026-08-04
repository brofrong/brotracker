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
	name: string;
	character?: string;
	profile_path?: string | null;
};

type TmdbCrewMember = {
	name: string;
	job: string;
};

type TmdbMovieDetails = {
	title?: string;
	release_date?: string;
	overview?: string;
	poster_path?: string | null;
	backdrop_path?: string | null;
	genres?: TmdbGenre[];
	runtime?: number | null;
	vote_average?: number;
	vote_count?: number;
};

type TmdbTvDetails = {
	name?: string;
	first_air_date?: string;
	overview?: string;
	poster_path?: string | null;
	backdrop_path?: string | null;
	genres?: TmdbGenre[];
	status?: string | null;
	number_of_seasons?: number | null;
	vote_average?: number;
	vote_count?: number;
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

export function posterUrl(posterPath: string | null | undefined): string | null {
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

export function yearFromDate(date: string | undefined): number | null {
	if (!date || date.length < 4) {
		return null;
	}
	const year = Number(date.slice(0, 4));
	return Number.isFinite(year) ? year : null;
}

export function parseCast(cast: TmdbCastMember[] | undefined): TitleCastMember[] {
	if (!cast) {
		return [];
	}

	return cast.slice(0, 12).map((member) => ({
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

export function parseMovieDetails(
	details: TmdbMovieDetails,
	credits: TmdbCredits,
): Omit<TmdbMeta, "similar"> {
	return {
		kind: "films",
		poster: posterUrl(details.poster_path),
		backdrop: backdropUrl(details.backdrop_path),
		name: details.title ?? "",
		year: yearFromDate(details.release_date),
		overview: details.overview ?? null,
		genres: (details.genres ?? []).map((g) => g.name),
		cast: parseCast(credits.cast),
		crew: parseKeyCrew(credits.crew),
		runtimeMinutes:
			details.runtime != null && details.runtime > 0 ? details.runtime : null,
		status: null,
		seasons: null,
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
	return {
		kind: "tv",
		poster: posterUrl(details.poster_path),
		backdrop: backdropUrl(details.backdrop_path),
		name: details.name ?? "",
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

export type { TmdbMovieDetails, TmdbTvDetails, TmdbCredits, TmdbSimilarResponse };
