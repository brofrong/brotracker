import { err } from "neverthrow";
import type { CreateTracker, SearchOptions } from "../../tracker-interface";
import { rutrackerSearch } from "./rutracker-search";

export const RUTRACKER_URL = "https://rutracker.org" as const;

export const createRutracker: CreateTracker = async (_tracker, options) => {
	return {
		search: async (query: string, queryOptions: Partial<SearchOptions>) => {
			return rutrackerSearch(query, queryOptions, options);
		},
		getTorrent: async (torrentFileUrl: string) => {
			return err(new Error("Not implemented"));
		},
	};
};
