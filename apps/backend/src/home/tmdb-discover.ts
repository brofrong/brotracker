import type { TmdbCredentials } from "../settings/provider-settings";
import {
	createTmdbBrowse,
	mapBrowseItem,
	type TmdbBrowseItem,
} from "../title/tmdb-browse";
import type { DiscoverCard } from "./home";

export function mapTrendingItem(item: TmdbBrowseItem): DiscoverCard | null {
	return mapBrowseItem(item);
}

export function createFetchDiscoverFeed(
	resolveCredentials: () => Promise<TmdbCredentials | undefined>,
): () => Promise<DiscoverCard[] | null> {
	const browse = createTmdbBrowse({ resolveCredentials });

	return async () => {
		const outcome = await browse.fetchTrending(1);
		if (outcome.status === "unavailable" || outcome.status === "error") {
			return null;
		}
		return outcome.data.items;
	};
}
