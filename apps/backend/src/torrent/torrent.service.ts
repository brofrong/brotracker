import type { SearchOptions } from "@brotracker/rutracker-ts/tracker/tracker-interface";
import { createTracker } from "@brotracker/rutracker-ts/index";
import { createMemoryStore } from "@brotracker/rutracker-ts/index";
import { env } from "../utils/env";

const tracker = await createTracker("Rutracker", {
	auth: {
		login: env.RUTRACKER_LOGIN,
		password: env.RUTRACKER_PASSWORD,
	},
	store: createMemoryStore(),
	proxyAgent: null,
});

export const torrentService = {
	search: async (query: string, options: Partial<SearchOptions>) => {
		return tracker.search(query, options);
	},
};
