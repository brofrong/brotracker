import type { SearchOptions } from "@brotracker/rutracker-ts/tracker/tracker-interface";
import { tracker } from "./torrent.tracker";

export const torrentService = {
	search: async (query: string, options: Partial<SearchOptions>) => {
		return tracker.search(query, options);
	},
};
