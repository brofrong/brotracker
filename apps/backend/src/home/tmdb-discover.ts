import { yearFromDate } from "../title/tmdb-meta";
import { logger } from "../utils/logger";
import type { DiscoverCard } from "./home";

const TMDB_BASE = "https://api.themoviedb.org/3";
/** Use a slightly smaller poster for dense home grids. */
const DISCOVER_POSTER_BASE = "https://image.tmdb.org/t/p/w342";

type TmdbTrendingItem = {
	id: number;
	media_type?: string;
	title?: string;
	name?: string;
	poster_path?: string | null;
	release_date?: string;
	first_air_date?: string;
};

type TmdbTrendingResponse = {
	results?: TmdbTrendingItem[];
};

function discoverPoster(
	posterPath: string | null | undefined,
): string | null {
	if (!posterPath) {
		return null;
	}
	return `${DISCOVER_POSTER_BASE}${posterPath}`;
}

export function mapTrendingItem(
	item: TmdbTrendingItem,
): DiscoverCard | null {
	if (item.media_type === "movie") {
		return {
			titleId: `tmdb:films:${item.id}`,
			name: item.title?.trim() || "Без названия",
			poster: discoverPoster(item.poster_path),
			year: yearFromDate(item.release_date),
			kind: "films",
		};
	}

	if (item.media_type === "tv") {
		return {
			titleId: `tmdb:tv:${item.id}`,
			name: item.name?.trim() || "Без названия",
			poster: discoverPoster(item.poster_path),
			year: yearFromDate(item.first_air_date),
			kind: "tv",
		};
	}

	return null;
}

export function createFetchDiscoverFeed(
	apiKey: string | undefined,
): () => Promise<DiscoverCard[] | null> {
	return async () => {
		if (!apiKey) {
			return null;
		}

		const url = `${TMDB_BASE}/trending/all/day?api_key=${encodeURIComponent(apiKey)}&language=ru-RU`;

		try {
			const response = await fetch(url, {
				headers: { Accept: "application/json" },
			});
			if (!response.ok) {
				logger.warn(
					{ status: response.status },
					"tmdb discover trending failed",
				);
				return null;
			}

			const body = (await response.json()) as TmdbTrendingResponse;
			const items = (body.results ?? [])
				.map(mapTrendingItem)
				.filter((card): card is DiscoverCard => card != null);

			return items;
		} catch (err) {
			logger.warn(
				{ err: err instanceof Error ? err.message : String(err) },
				"tmdb discover trending error",
			);
			return null;
		}
	};
}
