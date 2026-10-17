import { listQbTorrentsSafe, toWatchView } from "./title";
import type {
	TaggedQbTorrent,
	Title,
	TitleWatchView,
	WatchlistItem,
} from "./title.types";
import { extractTopicId, findTransferForTopic } from "./topic-tag";
import type { TitleWatchRecord } from "./watch/check-topic-now";
import { parseEpisodeProgress } from "./watch/episode-progress";
import type { SyncQbTorrent } from "./watch/sync-watches-from-qb";

export type { WatchlistItem } from "./title.types";

export type WatchlistDeps = {
	/** `module.get({ id, language: "ru-RU" })`. */
	getTitle: (titleId: string) => Promise<Title>;
	loadWatchByTitleId: (titleId: string) => Promise<TitleWatchRecord | null>;
	loadWatchById: (id: string) => Promise<TitleWatchRecord | null>;
	listWatchlistRecords: () => Promise<TitleWatchRecord[]>;
	saveWatch: (r: TitleWatchRecord) => Promise<void>;
	deleteWatch: (id: string) => Promise<void>;
	listTaggedTorrents: () => Promise<TaggedQbTorrent[]>;
	/** For episode progress (`parseEpisodeProgress`). */
	listQbTorrents: () => Promise<SyncQbTorrent[]>;
	/** `waitingSearch.checkOne`. */
	checkWaiting: (watchId: string) => Promise<TitleWatchRecord | null>;
	/** `module.checkTopic`: checks the row that watches this topic. */
	checkTracking: (target: {
		topicUrl: string;
		titleId: string;
	}) => Promise<unknown>;
	now: () => string;
	newId: () => string;
};

export class WatchlistError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "WatchlistError";
	}
}

type QbSnapshot = { tagged: TaggedQbTorrent[]; torrents: SyncQbTorrent[] };

function toItem(
	record: TitleWatchRecord & { titleId: string },
	qb: QbSnapshot,
): WatchlistItem {
	const topicId = record.topicUrl ? extractTopicId(record.topicUrl) : null;
	const transfer = topicId ? findTransferForTopic(topicId, qb.tagged) : null;
	const hash = record.qbHash ?? transfer?.hash ?? null;
	const torrent = hash ? qb.torrents.find((item) => item.hash === hash) : null;
	return {
		id: record.id,
		titleId: record.titleId,
		kind: record.kind,
		name: record.titleName,
		poster: record.poster,
		year: record.year,
		season: record.season,
		watch: record.watch,
		topicUrl: record.topicUrl,
		lastCheckedAt: record.lastCheckedAt,
		lastChangedAt: record.lastChangedAt,
		lastError: record.lastError,
		waitingOutcome: record.waitingOutcome,
		waitingOutcomeDetail: record.waitingOutcomeDetail,
		episodes: torrent ? parseEpisodeProgress(torrent.name) : null,
		transfer,
		createdAt: record.createdAt,
	};
}

function isListed(
	record: TitleWatchRecord,
): record is TitleWatchRecord & { titleId: string } {
	return record.titleId !== null && record.watch !== "off";
}

/** «Жду»: put a Title on the watchlist, list it, take it off, check it now. */
export function createWatchlist(deps: WatchlistDeps) {
	/** qB state for transfers/episodes; empty when qB is unreachable. */
	async function loadQb(): Promise<QbSnapshot> {
		const [tagged, torrents] = await Promise.all([
			deps.listTaggedTorrents().catch(() => []),
			listQbTorrentsSafe(deps),
		]);
		return { tagged, torrents };
	}

	async function viewOf(record: TitleWatchRecord): Promise<TitleWatchView> {
		return toWatchView(record, await listQbTorrentsSafe(deps));
	}

	/** Puts a switched-off watch back: a series with its topic resumes tracking. */
	function revive(off: TitleWatchRecord, title: Title): TitleWatchRecord {
		const fromMeta = {
			titleName: title.meta.name ?? off.titleName,
			poster: title.meta.poster ?? off.poster,
			year: title.meta.year ?? off.year,
			lastChangedAt: deps.now(),
			lastError: null,
		};
		if (title.facet === "tv" && off.topicUrl) {
			return { ...off, ...fromMeta, kind: "tv", watch: "tracking" };
		}
		return {
			...off,
			...fromMeta,
			...searchFields(title),
			watch: "waiting",
			source: "manual",
			topicUrl: null,
			qbHash: null,
			size: null,
			registeredAt: null,
			contentHash: null,
			lastCheckedAt: null,
			waitingOutcome: null,
			waitingOutcomeDetail: null,
		};
	}

	function searchFields(title: Title) {
		return {
			kind: title.facet,
			season: title.facet === "tv" ? title.meta.seasons : null,
		};
	}

	function newWaiting(titleId: string, title: Title): TitleWatchRecord {
		const now = deps.now();
		return {
			id: deps.newId(),
			topicUrl: null,
			titleId,
			...searchFields(title),
			watch: "waiting",
			source: "manual",
			titleName: title.meta.name,
			poster: title.meta.poster,
			year: title.meta.year,
			size: null,
			registeredAt: null,
			contentHash: null,
			qbHash: null,
			lastCheckedAt: null,
			lastChangedAt: now,
			lastError: null,
			waitingOutcome: null,
			waitingOutcomeDetail: null,
			createdAt: now,
		};
	}

	return {
		/**
		 * A Title that already has a watch keeps it (no second row); a
		 * switched-off one is re-used; otherwise a new waiting row is created.
		 */
		async wait(input: { titleId: string }): Promise<TitleWatchView> {
			const existing = await deps.loadWatchByTitleId(input.titleId);
			if (existing && existing.watch !== "off") {
				return viewOf(existing);
			}

			const title = await deps.getTitle(input.titleId);
			if (!title.facet) {
				throw new WatchlistError("Ждать можно только фильм или сериал из TMDB");
			}
			// Without TMDB data the row would have no name, season or search queries.
			if (title.metaStatus !== "ok") {
				throw new WatchlistError("TMDB недоступен — попробуйте позже");
			}

			const record = existing
				? revive(existing, title)
				: newWaiting(input.titleId, title);
			await deps.saveWatch(record);
			return viewOf(record);
		},

		/** A series watch with a topic is switched off (qB sync would recreate it); anything else is deleted. */
		async remove(input: { id: string }): Promise<void> {
			const record = await deps.loadWatchById(input.id);
			if (!record) return;
			if (record.kind === "tv" && record.topicUrl) {
				await deps.saveWatch({
					...record,
					watch: "off",
					lastChangedAt: deps.now(),
				});
				return;
			}
			await deps.deleteWatch(record.id);
		},

		async list(): Promise<WatchlistItem[]> {
			const [records, qb] = await Promise.all([
				deps.listWatchlistRecords(),
				loadQb(),
			]);
			return records.filter(isListed).map((record) => toItem(record, qb));
		},

		/** Pause/resume this row (not "the Title's watch": a Title may have several rows). */
		async setState(input: {
			id: string;
			watch: "tracking" | "paused";
		}): Promise<WatchlistItem | null> {
			const record = await deps.loadWatchById(input.id);
			if (!record || !isListed(record)) return null;
			if (
				(record.watch !== "tracking" && record.watch !== "paused") ||
				!record.topicUrl
			) {
				throw new WatchlistError(
					"Приостановить можно только отслеживаемый сериал",
				);
			}
			const updated: TitleWatchRecord & { titleId: string } = {
				...record,
				watch: input.watch,
			};
			if (record.watch !== input.watch) {
				await deps.saveWatch(updated);
			}
			return toItem(updated, await loadQb());
		},

		async checkNow(input: { id: string }): Promise<WatchlistItem | null> {
			const record = await deps.loadWatchById(input.id);
			if (!record) return null;

			if (record.watch === "waiting") {
				await deps.checkWaiting(record.id);
			} else if (
				(record.watch === "tracking" || record.watch === "paused") &&
				record.titleId &&
				record.topicUrl
			) {
				// By this row's own topic: a Title may have several rows.
				await deps.checkTracking({
					topicUrl: record.topicUrl,
					titleId: record.titleId,
				});
			}

			// A waiting row may have been merged into the row that owns its topic.
			const current =
				(await deps.loadWatchById(record.id)) ??
				(record.titleId ? await deps.loadWatchByTitleId(record.titleId) : null);
			if (!current || !isListed(current)) return null;
			return toItem(current, await loadQb());
		},
	};
}

export type Watchlist = ReturnType<typeof createWatchlist>;
