/** Matches RuTracker MediaType / app domain: films | tv. */
export type PersonCreditKind = "films" | "tv";

export type PersonCredit = {
	titleId: string;
	kind: PersonCreditKind;
	name: string;
	character: string | null;
	poster: string | null;
	year: number | null;
	rating: number | null;
};

export type PersonView = {
	name: string;
	biography: string | null;
	birthday: string | null;
	deathday: string | null;
	placeOfBirth: string | null;
	knownForDepartment: string | null;
	profileUrl: string | null;
	credits: PersonCredit[];
};

export type FetchPersonOutcome =
	| { status: "ok"; person: PersonView }
	| { status: "unavailable" }
	| { status: "error" };

export type PersonDeps = {
	fetchPerson: (
		tmdbId: number,
		language: string,
	) => Promise<FetchPersonOutcome>;
};
