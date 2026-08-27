import { fetchWithProxy } from "../http/fetch-with-proxy";
import type { TmdbCredentials } from "../settings/provider-settings";
import { logger } from "../utils/logger";
import type { FetchPersonOutcome } from "./person.types";
import {
	parsePersonCredits,
	parsePersonDetails,
	type TmdbCombinedCredits,
	type TmdbPersonDetails,
} from "./tmdb-person";

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

export function createFetchTmdbPerson(
	resolveCredentials: () => Promise<TmdbCredentials | undefined>,
): (tmdbId: number, language: string) => Promise<FetchPersonOutcome> {
	return async (tmdbId, language) => {
		const credentials = await resolveCredentials();
		if (!credentials) {
			return { status: "unavailable" };
		}

		const [details, credits] = await Promise.all([
			fetchTmdbJson<TmdbPersonDetails>(
				`/person/${tmdbId}`,
				credentials,
				language,
			),
			fetchTmdbJson<TmdbCombinedCredits>(
				`/person/${tmdbId}/combined_credits`,
				credentials,
				language,
			),
		]);

		if (!details) {
			return { status: "error" };
		}

		return {
			status: "ok",
			person: {
				...parsePersonDetails(details),
				credits: parsePersonCredits(credits),
			},
		};
	};
}
