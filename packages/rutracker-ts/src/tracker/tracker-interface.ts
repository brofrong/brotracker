import type { Result } from "neverthrow";
import type { ProxyAgent } from "./search-engine/rutracker/http";
import type { FileStore } from "./storage/file-store";

export type SearchResult = {
	category: string;
	forumId: string;
	torrentId: string;
	title: string;
	authorId: string;
	size: number;
	seeds: number;
	leeches: number;
	downloads: number;
	date: Date;
	torrentFileUrl: string;
	topicUrl: string;
	hdr: "HDR" | "SDR" | null;
	resolution: "4K" | "1080p" | "720p" | "SD" | null;
};

/** Parsed search page. Pagination beyond the first page is not implemented yet. */
export type SearchPage = {
	results: SearchResult[];
	totalResults: number | null;
};

export const Category = ["films", "tv"] as const;
export const SortType = [
	"registrationDate",
	"themeName",
	"downloadsTimes",
	"seedsCount",
	"leechesCount",
	"fileSize",
] as const;

export type SearchOptions = {
	category?: (typeof Category)[number] | null;
	sortType?: (typeof SortType)[number] | null;
	sortOrder?: "ascending" | "descending" | null;
};

export type TrackerInterface = {
	search(
		query: string,
		options?: Partial<SearchOptions>,
	): Promise<Result<SearchPage, Error>>;
	_getHTML(
		query: string,
		options?: Partial<SearchOptions>,
	): Promise<Result<string, Error>>;
	_parseHTML(html: string): Promise<Result<SearchPage, Error>>;
	getTorrent(torrentFileUrl: string): Promise<Result<void, Error>>;
	getImage(torrentId: string): Promise<Result<string, Error>>;
};

const trackers = ["Rutracker"] as const;

export type Tracker = (typeof trackers)[number];

export type RutrackerOptions = {
	auth: {
		login: string;
		password: string;
	};
	fileStore: FileStore;
	proxyAgent: ProxyAgent;
	/**
	 * Byparr / FlareSolverr-compatible `/v1` URL for Cloudflare clearance.
	 * Default: http://localhost:8191/v1
	 */
	cfSolverUrl?: string;
};

export type CreateTracker = (
	tracker: Tracker,
	options: RutrackerOptions,
) => Promise<TrackerInterface>;
