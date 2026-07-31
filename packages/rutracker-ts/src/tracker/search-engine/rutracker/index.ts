import { err } from "neverthrow";
import type { CreateTracker, SearchOptions } from "../../tracker-interface";
import { rutrackerGetImage } from "./get-image";
import { parseResponse } from "./parse";
import { makeSearchRequest, rutrackerSearch } from "./search";

export { RUTRACKER_URL } from "./constants";

export const createRutracker: CreateTracker = async (_tracker, options) => {
	return {
		search: async (query: string, queryOptions: Partial<SearchOptions>) => {
			return rutrackerSearch(query, queryOptions, options);
		},
		getTorrent: async (_torrentFileUrl: string) => {
			return err(new Error("Not implemented"));
		},
		getImage: async (torrentId: string) => {
			return rutrackerGetImage(torrentId, options);
		},
		_getHTML: async (query: string, queryOptions: Partial<SearchOptions>) => {
			return makeSearchRequest(query, queryOptions, options);
		},
		_parseHTML: async (html: string) => {
			return parseResponse(html);
		},
	};
};
