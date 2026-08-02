import type { TitleWatchRecord, TopicMeta } from "./check-topic-now";
import type { SyncQbTorrent } from "./sync-watches-from-qb";

/** Matches RuTracker MediaType / app domain: films | tv. */
export type TitleKind = "films" | "tv";

export type TitleRef =
	| { type: "tmdb"; kind: TitleKind; tmdbId: number }
	| { type: "topic"; topicUrl: string }
	| { type: "qb"; hash: string };

export type TitleMetaStatus = "ok" | "degraded" | "empty";

export type TitleCastMember = {
	name: string;
	character: string | null;
	profileUrl: string | null;
};

export type TitleCrewMember = {
	name: string;
	job: string;
};

export type TitleMeta = {
	poster: string | null;
	name: string | null;
	year: number | null;
	overview: string | null;
	genres: string[];
	cast: TitleCastMember[];
	crew: TitleCrewMember[];
	/** films facet */
	runtimeMinutes: number | null;
	/** tv facet */
	status: string | null;
	/** tv facet */
	seasons: number | null;
};

export type TmdbRating = {
	source: "tmdb";
	status: "ok";
	value: number;
	voteCount: number | null;
};

export type TmdbRatingUnavailable = {
	source: "tmdb";
	status: "unavailable";
};

export type ImdbRatingStub = {
	source: "imdb";
	status: "unconfigured";
};

export type KinopoiskRatingStub = {
	source: "kinopoisk";
	status: "unconfigured";
};

export type TitleRating =
	| TmdbRating
	| TmdbRatingUnavailable
	| ImdbRatingStub
	| KinopoiskRatingStub;

export type TitleWatchState = "tracking" | "paused" | "completed" | "off";

export type TitleWatchView = {
	topicUrl: string;
	watch: TitleWatchState;
	source: "auto-qb" | "manual";
	lastCheckedAt: string | null;
	lastChangedAt: string | null;
	lastError: string | null;
};

export type Title = {
	id: string;
	facet: TitleKind | null;
	meta: TitleMeta;
	metaStatus: TitleMetaStatus;
	ratings: TitleRating[];
	/** TV follow state when linked to this title; null for films / no follow. */
	watch: TitleWatchView | null;
};

export type TmdbMeta = {
	kind: TitleKind;
	poster: string | null;
	name: string;
	year: number | null;
	overview: string | null;
	genres: string[];
	cast: TitleCastMember[];
	crew: TitleCrewMember[];
	runtimeMinutes: number | null;
	status: string | null;
	seasons: number | null;
	voteAverage: number | null;
	voteCount: number | null;
};

export type FetchTmdbMetaOutcome =
	| { status: "ok"; meta: TmdbMeta }
	| { status: "unavailable" }
	| { status: "error" };

export type RatingsContext = {
	titleId: string;
	tmdbKind?: TitleKind;
	tmdbId?: number;
	tmdbVoteAverage?: number | null;
	tmdbVoteCount?: number | null;
};

export type TitleTorrentCandidate = {
	torrentId: string;
	title: string;
	size: number;
	seeds: number;
	leeches: number;
	torrentFileUrl: string;
	topicUrl: string;
	hdr: "HDR" | "SDR" | null;
	resolution: "4K" | "1080p" | "720p" | "SD" | null;
	forumId: string;
};

export type TitleTorrentBadge = "4K" | "1080p" | "720p" | "SD" | "HDR";

export type TitleTorrentTransfer = {
	hash: string;
	progress: number;
	stateKind: string;
	stateLabel: string;
	downloadSpeed: number;
	etaSeconds: number;
};

export type TitleTorrent = {
	torrentId: string;
	topicUrl: string;
	title: string;
	size: number;
	seeds: number;
	leeches: number;
	qualityScore: number;
	badges: TitleTorrentBadge[];
	source: "local" | "tracker";
	torrentFileUrl: string;
	forumId: string;
	transfer: TitleTorrentTransfer | null;
};

export type TitleTorrentsResult = {
	status: "ok" | "degraded" | "empty";
	items: TitleTorrent[];
};

export type TrackerSearchForTitle =
	| { status: "ok"; results: TitleTorrentCandidate[] }
	| { status: "unavailable" }
	| { status: "error" };

export type TaggedQbTorrent = {
	hash: string;
	progress: number;
	stateKind: string;
	stateLabel: string;
	downloadSpeed: number;
	etaSeconds: number;
	tags: string;
};

export type TitleDeps = {
	fetchTmdbMeta: (
		kind: TitleKind,
		tmdbId: number,
	) => Promise<FetchTmdbMetaOutcome>;
	getRatings: (ctx: RatingsContext) => Promise<TitleRating[]>;
	searchLocal: (query: string) => Promise<TitleTorrentCandidate[]>;
	searchTracker: (query: string) => Promise<TrackerSearchForTitle>;
	listTaggedTorrents: () => Promise<TaggedQbTorrent[]>;
	addFromTracker: (
		torrentFileUrl: string,
		kind: TitleKind,
		tags: string[],
	) => Promise<void>;
	loadWatchByTopicUrl: (topicUrl: string) => Promise<TitleWatchRecord | null>;
	loadWatchByTitleId: (titleId: string) => Promise<TitleWatchRecord | null>;
	saveWatch: (record: TitleWatchRecord) => Promise<void>;
	listQbTorrents: () => Promise<SyncQbTorrent[]>;
	getSeriesPath: () => Promise<string | null>;
	fetchTorrentBytes: (torrentFileUrl: string) => Promise<Uint8Array>;
	fetchTopicMeta: (topicUrl: string) => Promise<TopicMeta>;
	replaceInQb: (input: {
		topicId: string;
		torrentBytes: Uint8Array;
		tags: string[];
	}) => Promise<void>;
	isCompletePack: (torrentName: string) => boolean;
	now: () => string;
};
