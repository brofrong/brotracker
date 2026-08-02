import { env } from "../utils/env";
import { logger } from "../utils/logger";
import { createDefaultRatingsPort } from "./ratings-port";
import { createTitleModule } from "./title";
import type { FetchTmdbMetaOutcome, TitleKind } from "./title.types";
import {
	parseMovieDetails,
	parseTvDetails,
	type TmdbCredits,
	type TmdbMovieDetails,
	type TmdbTvDetails,
} from "./tmdb-meta";

const TMDB_BASE = "https://api.themoviedb.org/3";

function tmdbAuthQuery(apiKey: string): string {
	return `api_key=${encodeURIComponent(apiKey)}`;
}

async function fetchTmdbJson<T>(
	path: string,
	apiKey: string,
): Promise<T | null> {
	const url = `${TMDB_BASE}${path}${
		path.includes("?") ? "&" : "?"
	}${tmdbAuthQuery(apiKey)}&language=ru-RU`;

	try {
		const response = await fetch(url, {
			headers: {
				Accept: "application/json",
			},
		});

		if (!response.ok) {
			logger.warn(
				{ path, status: response.status },
				"tmdb fetch failed",
			);
			return null;
		}

		return (await response.json()) as T;
	} catch (err) {
		logger.warn(
			{ path, err: err instanceof Error ? err.message : String(err) },
			"tmdb fetch error",
		);
		return null;
	}
}

export function createFetchTmdbMeta(
	apiKey: string | undefined,
): (kind: TitleKind, tmdbId: number) => Promise<FetchTmdbMetaOutcome> {
	return async (kind, tmdbId) => {
		if (!apiKey) {
			return { status: "unavailable" };
		}

		const segment = kind === "films" ? "movie" : "tv";
		const detailsPath = `/${segment}/${tmdbId}`;
		const creditsPath = `/${segment}/${tmdbId}/credits`;

		const [details, credits] = await Promise.all([
			fetchTmdbJson<TmdbMovieDetails | TmdbTvDetails>(detailsPath, apiKey),
			fetchTmdbJson<TmdbCredits>(creditsPath, apiKey),
		]);

		if (!details || !credits) {
			return { status: "error" };
		}

		const meta =
			kind === "films"
				? parseMovieDetails(details as TmdbMovieDetails, credits)
				: parseTvDetails(details as TmdbTvDetails, credits);

		return { status: "ok", meta };
	};
}

const ratingsPort = createDefaultRatingsPort();

export const titleModule = createTitleModule({
	fetchTmdbMeta: createFetchTmdbMeta(env.TMDB_API_KEY),
	getRatings: ratingsPort.getRatings,
});

export { createTitleModule };
