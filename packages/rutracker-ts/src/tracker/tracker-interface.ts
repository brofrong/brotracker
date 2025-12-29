import type { Result } from "neverthrow";
import type { MemoryStore } from "./utils/memory-store";

export type SearchResult = {
	category: string;
	torrentId: string;
	title: string;
	author: string;
	size: number;
	seeds: number;
	leeches: number;
	downloads: number;
	date: string;
	torrentFileUrl: string;
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
	): Promise<Result<SearchResult[], Error>>;
	getTorrent(torrentFileUrl: string): Promise<Result<void, Error>>;
};

const trackers = ["Rutracker"] as const;

export type Tracker = (typeof trackers)[number];

export type RutrackerOptions = {
	auth: {
		login: string;
		password: string;
	};
	store: MemoryStore;
	proxyAgent: null;
};

export type CreateTracker = (
	tracker: Tracker,
	options: RutrackerOptions,
) => Promise<TrackerInterface>;
