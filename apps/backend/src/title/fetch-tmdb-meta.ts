import { fetchWithProxy } from "../http/fetch-with-proxy";
import type { TmdbCredentials } from "../settings/provider-settings";
import { logger } from "../utils/logger";
import type { FetchTmdbMetaOutcome, TitleKind } from "./title.types";
import {
	parseMovieDetails,
	parseSimilar,
	parseTvDetails,
	type TmdbCredits,
	type TmdbMovieDetails,
	type TmdbSimilarResponse,
	type TmdbTvDetails,
} from "./tmdb-meta";

const TMDB_BASE = "https://api.themoviedb.org/3";

function tmdbAuthQuery(apiKey: string): string {
	return `api_key=${encodeURIComponent(apiKey)}`;
}

async function fetchTmdbJson<T>(
	path: string,
	credentials: TmdbCredentials,
	language: string,
): Promise<T | null> {
	const url = `${TMDB_BASE}${path}${
		path.includes("?") ? "&" : "?"
	}${tmdbAuthQuery(credentials.apiKey)}&language=${encodeURIComponent(language)}`;

	try {
		const response = await fetchWithProxy(url, {
			headers: {
				Accept: "application/json",
			},
			proxyUrl: credentials.proxyUrl,
		});

		if (!response.ok) {
			logger.warn({ path, status: response.status }, "tmdb fetch failed");
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
	resolveCredentials: () => Promise<TmdbCredentials | undefined>,
): (
	kind: TitleKind,
	tmdbId: number,
	language: string,
) => Promise<FetchTmdbMetaOutcome> {
	return async (kind, tmdbId, language) => {
		const credentials = await resolveCredentials();
		if (!credentials) {
			return { status: "unavailable" };
		}

		const segment = kind === "films" ? "movie" : "tv";
		const detailsPath = `/${segment}/${tmdbId}`;
		const creditsPath = `/${segment}/${tmdbId}/credits`;
		const similarPath = `/${segment}/${tmdbId}/similar`;

		const [details, credits, similar] = await Promise.all([
			fetchTmdbJson<TmdbMovieDetails | TmdbTvDetails>(
				detailsPath,
				credentials,
				language,
			),
			fetchTmdbJson<TmdbCredits>(creditsPath, credentials, language),
			fetchTmdbJson<TmdbSimilarResponse>(similarPath, credentials, language),
		]);

		if (!details || !credits) {
			return { status: "error" };
		}

		const parsed =
			kind === "films"
				? parseMovieDetails(details as TmdbMovieDetails, credits)
				: parseTvDetails(details as TmdbTvDetails, credits);

		return {
			status: "ok",
			meta: { ...parsed, similar: parseSimilar(similar, kind) },
		};
	};
}
