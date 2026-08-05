import { fetchWithProxy } from "../http/fetch-with-proxy";
import type { TmdbCredentials } from "../settings/provider-settings";
import { logger } from "../utils/logger";
import { yearFromDate } from "../title/tmdb-meta";

const TMDB_BASE = "https://api.themoviedb.org/3";
/** Slightly smaller poster for dense grids / carousels. */
const BROWSE_POSTER_BASE = "https://image.tmdb.org/t/p/w342";

export type BrowseCard = {
	titleId: string;
	name: string;
	poster: string | null;
	year: number | null;
	kind: "films" | "tv";
	/** TMDB vote average rounded to 1 decimal; `null` when unrated. */
	rating: number | null;
};

export type BrowsePage = {
	items: BrowseCard[];
	page: number;
	totalPages: number;
};

export type BrowseOutcome =
	| { status: "ok"; data: BrowsePage }
	| { status: "unavailable" }
	| { status: "error" };

export type TmdbBrowseItem = {
	id: number;
	media_type?: string;
	title?: string;
	name?: string;
	poster_path?: string | null;
	release_date?: string;
	first_air_date?: string;
	vote_average?: number;
};

type TmdbBrowseResponse = {
	page?: number;
	total_pages?: number;
	results?: TmdbBrowseItem[];
};

export type TmdbBrowseDeps = {
	resolveCredentials: () => Promise<TmdbCredentials | undefined>;
	fetchJson?: (url: string, proxyUrl: string | null) => Promise<Response>;
};

function browsePoster(posterPath: string | null | undefined): string | null {
	if (!posterPath) {
		return null;
	}
	return `${BROWSE_POSTER_BASE}${posterPath}`;
}

/** TMDB returns 0 for unrated titles — treat that as "no rating". */
function browseRating(voteAverage: number | undefined): number | null {
	if (!voteAverage || voteAverage <= 0) {
		return null;
	}
	return Math.round(voteAverage * 10) / 10;
}

export function mapBrowseItem(item: TmdbBrowseItem): BrowseCard | null {
	if (item.media_type === "movie") {
		return {
			titleId: `tmdb:films:${item.id}`,
			name: item.title?.trim() || "Без названия",
			poster: browsePoster(item.poster_path),
			year: yearFromDate(item.release_date),
			kind: "films",
			rating: browseRating(item.vote_average),
		};
	}

	if (item.media_type === "tv") {
		return {
			titleId: `tmdb:tv:${item.id}`,
			name: item.name?.trim() || "Без названия",
			poster: browsePoster(item.poster_path),
			year: yearFromDate(item.first_air_date),
			kind: "tv",
			rating: browseRating(item.vote_average),
		};
	}

	return null;
}

function mapBrowsePage(body: TmdbBrowseResponse): BrowsePage {
	const items = (body.results ?? [])
		.map(mapBrowseItem)
		.filter((card): card is BrowseCard => card != null);

	return {
		items,
		page: body.page ?? 1,
		totalPages: Math.max(1, body.total_pages ?? 1),
	};
}

async function defaultFetchJson(
	url: string,
	proxyUrl: string | null,
): Promise<Response> {
	return fetchWithProxy(url, {
		headers: { Accept: "application/json" },
		proxyUrl,
	});
}

export function createTmdbBrowse(deps: TmdbBrowseDeps) {
	const fetchJson = deps.fetchJson ?? defaultFetchJson;

	async function request(
		pathAndQuery: string,
		logLabel: string,
	): Promise<BrowseOutcome> {
		const credentials = await deps.resolveCredentials();
		if (!credentials) {
			return { status: "unavailable" };
		}

		const url = `${TMDB_BASE}${pathAndQuery}${
			pathAndQuery.includes("?") ? "&" : "?"
		}api_key=${encodeURIComponent(credentials.apiKey)}&language=ru-RU`;

		try {
			const response = await fetchJson(url, credentials.proxyUrl);
			if (!response.ok) {
				logger.warn(
					{ status: response.status, path: pathAndQuery },
					`${logLabel} failed`,
				);
				return { status: "error" };
			}

			const body = (await response.json()) as TmdbBrowseResponse;
			return { status: "ok", data: mapBrowsePage(body) };
		} catch (err) {
			logger.warn(
				{ err: err instanceof Error ? err.message : String(err) },
				`${logLabel} error`,
			);
			return { status: "error" };
		}
	}

	return {
		fetchTrending: (page: number): Promise<BrowseOutcome> =>
			request(
				`/trending/all/day?page=${encodeURIComponent(String(page))}`,
				"tmdb browse trending",
			),

		searchMulti: (query: string, page: number): Promise<BrowseOutcome> =>
			request(
				`/search/multi?query=${encodeURIComponent(query)}&page=${encodeURIComponent(String(page))}`,
				"tmdb browse search",
			),
	};
}

export type TmdbBrowse = ReturnType<typeof createTmdbBrowse>;
