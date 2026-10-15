import type { SearchOptions, TrackerInterface } from "../../tracker-interface";
import { rutorGetImage } from "./get-image";
import { rutorGetTorrent } from "./get-torrent";
import type { RutorOptions } from "./options";
import { parseResponse } from "./parse";
import { makeSearchRequest, rutorSearch } from "./search";

export { RUTOR_DL_URL, RUTOR_URL } from "./constants";
export type { RutorOptions } from "./options";

export function createRutor(options: RutorOptions): TrackerInterface {
	return {
		search: async (query: string, queryOptions?: Partial<SearchOptions>) =>
			rutorSearch(query, queryOptions ?? {}, options),
		getTorrent: async (torrentFileUrl: string) =>
			rutorGetTorrent(torrentFileUrl, options),
		getImage: async (torrentId: string) => rutorGetImage(torrentId, options),
		_getHTML: async (query: string, queryOptions?: Partial<SearchOptions>) =>
			makeSearchRequest(query, queryOptions ?? {}, options),
		_parseHTML: async (html: string) => parseResponse(html),
	};
}
