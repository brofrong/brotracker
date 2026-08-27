import { yearFromDate } from "../tmdb/dates";
import type { PersonCredit, PersonView } from "./person.types";

const PROFILE_BASE = "https://image.tmdb.org/t/p/h632";
const POSTER_BASE = "https://image.tmdb.org/t/p/w342";

type TmdbPersonDetails = {
	name?: string;
	biography?: string | null;
	birthday?: string | null;
	deathday?: string | null;
	place_of_birth?: string | null;
	known_for_department?: string | null;
	profile_path?: string | null;
};

type TmdbCombinedCredit = {
	id?: number;
	media_type?: string;
	title?: string;
	name?: string;
	character?: string;
	poster_path?: string | null;
	release_date?: string;
	first_air_date?: string;
	vote_average?: number;
};

type TmdbCombinedCredits = {
	cast?: TmdbCombinedCredit[];
};

export function parsePersonDetails(
	details: TmdbPersonDetails,
): Omit<PersonView, "credits"> {
	return {
		name: details.name ?? "",
		biography: details.biography?.trim() || null,
		birthday: details.birthday || null,
		deathday: details.deathday || null,
		placeOfBirth: details.place_of_birth || null,
		knownForDepartment: details.known_for_department || null,
		profileUrl: details.profile_path
			? `${PROFILE_BASE}${details.profile_path}`
			: null,
	};
}

function creditDate(credit: TmdbCombinedCredit): string | undefined {
	return credit.media_type === "tv"
		? credit.first_air_date
		: credit.release_date;
}

function creditName(credit: TmdbCombinedCredit): string | undefined {
	return credit.media_type === "tv" ? credit.name : credit.title;
}

export function parsePersonCredits(
	response: TmdbCombinedCredits | null,
): PersonCredit[] {
	if (!response?.cast) {
		return [];
	}

	const items: PersonCredit[] = [];
	for (const credit of response.cast) {
		const kind = credit.media_type === "tv" ? "tv" : "films";
		if (credit.id == null) {
			continue;
		}
		const name = creditName(credit)?.trim();
		if (!name) {
			continue;
		}
		items.push({
			titleId: `tmdb:${kind}:${credit.id}`,
			kind,
			name,
			character: credit.character?.trim() || null,
			poster: credit.poster_path ? `${POSTER_BASE}${credit.poster_path}` : null,
			year: yearFromDate(creditDate(credit)),
			rating:
				credit.vote_average != null && credit.vote_average > 0
					? Math.round(credit.vote_average * 10) / 10
					: null,
		});
	}

	items.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));

	const seen = new Set<string>();
	const deduped: PersonCredit[] = [];
	for (const item of items) {
		if (seen.has(item.titleId)) {
			continue;
		}
		seen.add(item.titleId);
		deduped.push(item);
		if (deduped.length >= 24) {
			break;
		}
	}

	return deduped;
}

export type { TmdbPersonDetails, TmdbCombinedCredits };
