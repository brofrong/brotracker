import type { CreateTracker, SearchOptions } from "../../tracker-interface";
import { kinozalGetTorrent } from "./get-torrent";
import { kinozalGetImage } from "./get-image";
import { parseResponse } from "./parse";
import { makeSearchRequest, kinozalSearch } from "./search";

export {
	KINOZAL_DL_URL,
	KINOZAL_URL,
	KINOZAL_MIRRORS,
	DEFAULT_KINOZAL_MIRROR,
} from "./constants";
export type { KinozalMirror } from "./constants";
export {
	resolveKinozalMirror,
	isKinozalSiteHostname,
	isKinozalDlHostname,
	isKinozalDownloadUrl,
} from "./hosts";

export const createKinozal: CreateTracker = async (_tracker, options) => {
	return {
		search: async (query: string, queryOptions: Partial<SearchOptions>) => {
			return kinozalSearch(query, queryOptions, options);
		},
		getTorrent: async (torrentFileUrl: string) => {
			return kinozalGetTorrent(torrentFileUrl, options);
		},
		getImage: async (torrentId: string) => {
			return kinozalGetImage(torrentId, options);
		},
		_getHTML: async (query: string, queryOptions: Partial<SearchOptions>) => {
			return makeSearchRequest(query, queryOptions, options);
		},
		_parseHTML: async (html: string) => {
			return parseResponse(html, new Date(), options.baseUrl);
		},
	};
};
