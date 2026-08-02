import type { RatingsContext, TitleRating } from "./title.types";

export type RatingsPort = {
	getRatings: (ctx: RatingsContext) => Promise<TitleRating[]>;
};

export function createImdbRatingStub(): ImdbRatingStub {
	return { source: "imdb", status: "unconfigured" };
}

export function createKinopoiskRatingStub(): KinopoiskRatingStub {
	return { source: "kinopoisk", status: "unconfigured" };
}

export type ImdbRatingStub = Extract<
	TitleRating,
	{ source: "imdb"; status: "unconfigured" }
>;

export type KinopoiskRatingStub = Extract<
	TitleRating,
	{ source: "kinopoisk"; status: "unconfigured" }
>;

export function createTmdbRatingFromContext(
	ctx: RatingsContext,
): Extract<TitleRating, { source: "tmdb" }> {
	if (ctx.tmdbVoteAverage != null) {
		return {
			source: "tmdb",
			status: "ok",
			value: ctx.tmdbVoteAverage,
			voteCount: ctx.tmdbVoteCount ?? null,
		};
	}

	return { source: "tmdb", status: "unavailable" };
}

export function createDefaultRatingsPort(): RatingsPort {
	return {
		async getRatings(ctx) {
			return [
				createTmdbRatingFromContext(ctx),
				createImdbRatingStub(),
				createKinopoiskRatingStub(),
			];
		},
	};
}

export function createRatingsPort(
	overrides: Partial<RatingsPort> = {},
): RatingsPort {
	const defaults = createDefaultRatingsPort();
	return {
		getRatings: overrides.getRatings ?? defaults.getRatings,
	};
}
