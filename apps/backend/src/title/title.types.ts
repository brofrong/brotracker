import type {
	RecordWatchEvent,
	TitleWatchRecord,
	WaitingOutcome,
	WatchState,
} from "./watch/check-topic-now";
import type { EpisodeProgress } from "./watch/episode-progress";
import type {
	ProcessWatchTaskResult,
	WatchTask,
	WatchTaskTrigger,
} from "./watch/process-watch-task";
import type { SyncQbTorrent } from "./watch/sync-watches-from-qb";

/** Matches RuTracker MediaType / app domain: films | tv. */
export type TitleKind = "films" | "tv";

export type TitleRef =
	| { type: "tmdb"; kind: TitleKind; tmdbId: number }
	| { type: "topic"; topicUrl: string }
	| { type: "qb"; hash: string };

export type TitleMetaStatus = "ok" | "degraded" | "empty";

export type TitleCastMember = {
	/** TMDB person id — used to link to the person page. */
	id: number;
	name: string;
	character: string | null;
	profileUrl: string | null;
};

export type TitleCrewMember = {
	name: string;
	job: string;
};

export type TitleSimilarItem = {
	titleId: string;
	kind: TitleKind;
	name: string;
	poster: string | null;
	year: number | null;
	rating: number | null;
};

export type TitleMeta = {
	poster: string | null;
	backdrop: string | null;
	name: string | null;
	year: number | null;
	overview: string | null;
	genres: string[];
	cast: TitleCastMember[];
	crew: TitleCrewMember[];
	similar: TitleSimilarItem[];
	/** films facet */
	runtimeMinutes: number | null;
	/** tv facet */
	status: string | null;
	/** tv facet */
	seasons: number | null;
	originalName: string | null;
	alternativeNames: string[];
	/** tv facet: TMDB air year per season number (seasons without an air date are absent). */
	seasonAirYears: Record<number, number>;
	/** tv facet: year of the last aired episode. */
	lastAirYear: number | null;
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
	TmdbRating | TmdbRatingUnavailable | ImdbRatingStub | KinopoiskRatingStub;

export type TitleWatchState = WatchState;

export type TitleWatchView = {
	id: string;
	/** Null while the watch is still waiting for a release. */
	topicUrl: string | null;
	kind: TitleKind | null;
	watch: TitleWatchState;
	source: "auto-qb" | "manual";
	season: number | null;
	waitingOutcome: WaitingOutcome | null;
	waitingOutcomeDetail: string | null;
	lastCheckedAt: string | null;
	lastChangedAt: string | null;
	lastError: string | null;
	/** Episodes have/total parsed from the current torrent name; null when unknown. */
	progress: EpisodeProgress | null;
};

export type Title = {
	id: string;
	facet: TitleKind | null;
	meta: TitleMeta;
	metaStatus: TitleMetaStatus;
	ratings: TitleRating[];
	/** The Title's watch (series follow or «Жду»); null when nothing watches it. */
	watch: TitleWatchView | null;
};

export type TmdbMeta = {
	kind: TitleKind;
	poster: string | null;
	backdrop: string | null;
	name: string;
	year: number | null;
	overview: string | null;
	genres: string[];
	cast: TitleCastMember[];
	crew: TitleCrewMember[];
	similar: TitleSimilarItem[];
	runtimeMinutes: number | null;
	status: string | null;
	seasons: number | null;
	originalName: string | null;
	alternativeNames: string[];
	seasonAirYears: Record<number, number>;
	lastAirYear: number | null;
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

/** One row on the «Жду» page. */
export type WatchlistItem = {
	id: string;
	titleId: string;
	kind: TitleKind | null;
	name: string | null;
	poster: string | null;
	year: number | null;
	season: number | null;
	watch: TitleWatchState;
	topicUrl: string | null;
	lastCheckedAt: string | null;
	lastChangedAt: string | null;
	lastError: string | null;
	waitingOutcome: WaitingOutcome | null;
	waitingOutcomeDetail: string | null;
	episodes: EpisodeProgress | null;
	transfer: TitleTorrentTransfer | null;
	createdAt: string;
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
	/** Whether this release's parsed name/year fit the Title; always true when the Title has no metadata. */
	matches: boolean;
};

export type TitleTorrentsResult = {
	status: "ok" | "degraded" | "empty";
	items: TitleTorrent[];
};

export type TitleTorrentsSearch =
	| {
			status: "ok";
			local: TitleTorrentCandidate[];
			tracker: TitleTorrentCandidate[];
	  }
	| {
			status: "degraded";
			local: TitleTorrentCandidate[];
			trackerError: "unavailable" | "error";
	  };

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
		language: string,
	) => Promise<FetchTmdbMetaOutcome>;
	getRatings: (ctx: RatingsContext) => Promise<TitleRating[]>;
	searchTorrents: (query: string) => Promise<TitleTorrentsSearch>;
	listTaggedTorrents: () => Promise<TaggedQbTorrent[]>;
	addFromTracker: (
		torrentFileUrl: string,
		kind: TitleKind,
		tags: string[],
	) => Promise<void>;
	loadWatchByTopicUrl: (topicUrl: string) => Promise<TitleWatchRecord | null>;
	loadWatchByTitleId: (titleId: string) => Promise<TitleWatchRecord | null>;
	saveWatch: (record: TitleWatchRecord) => Promise<void>;
	deleteWatch: (id: string) => Promise<void>;
	/** Feed event (e.g. `download-started` when a waiting watch gets a topic). */
	recordEvent: RecordWatchEvent;
	listQbTorrents: () => Promise<SyncQbTorrent[]>;
	now: () => string;
	/** Enqueues a WatchTask row (manual trigger, always fresh — no dedup). */
	enqueueWatchTask: (input: {
		topicUrl: string;
		titleId: string | null;
		trigger: WatchTaskTrigger;
	}) => Promise<WatchTask>;
	/** Same path the nightly worker uses to drain pending tasks. */
	processWatchTask: (taskId: string) => Promise<ProcessWatchTaskResult>;
	/** Upsert a link between a key and a titleId. */
	upsertLink: (key: string, titleId: string) => Promise<void>;
	/** Load all title links. */
	loadAllLinks: () => Promise<Record<string, string>>;
	/** TitleWatches that point at a Title (fallback link for tracked series). */
	listTitledWatches: () => Promise<
		Array<{ topicUrl: string | null; titleId: string; qbHash: string | null }>
	>;
};
