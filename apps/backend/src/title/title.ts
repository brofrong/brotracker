import { parseReleaseTitle } from "@brotracker/rutracker-ts/tracker/release-title";

import { scoreTorrentQuality } from "../torrent/quality-score";
import { type MatchTarget, releaseMatchesTitle } from "./release-match";
import type {
	Title,
	TitleDeps,
	TitleKind,
	TitleMeta,
	TitleMetaStatus,
	TitleRef,
	TitleTorrent,
	TitleTorrentBadge,
	TitleTorrentCandidate,
	TitleTorrentsResult,
	TitleWatchView,
	TmdbMeta,
} from "./title.types";
import {
	extractTopicId,
	extractTopicIdFromTags,
	findTransferForTopic,
	topicTag,
} from "./topic-tag";
import type { CheckResult, TitleWatchRecord } from "./watch/check-topic-now";
import { parseEpisodeProgress } from "./watch/episode-progress";
import type { SyncQbTorrent } from "./watch/sync-watches-from-qb";

export function encodeTopicUrl(topicUrl: string): string {
	return Buffer.from(topicUrl, "utf8")
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/u, "");
}

export function titleRefToId(ref: TitleRef): string {
	switch (ref.type) {
		case "tmdb":
			return ref.kind === "films"
				? `tmdb:films:${ref.tmdbId}`
				: `tmdb:tv:${ref.tmdbId}`;
		case "topic":
			return `topic:${encodeTopicUrl(ref.topicUrl)}`;
		case "qb":
			return `qb:${ref.hash}`;
	}
}

type ParsedTmdbTitleId = {
	type: "tmdb";
	kind: TitleKind;
	tmdbId: number;
};

type ParsedTopicTitleId = {
	type: "topic";
};

type ParsedQbTitleId = {
	type: "qb";
};

type ParsedTitleId = ParsedTmdbTitleId | ParsedTopicTitleId | ParsedQbTitleId;

function parseTitleId(id: string): ParsedTitleId | null {
	if (id.startsWith("tmdb:films:")) {
		const tmdbId = Number(id.slice("tmdb:films:".length));
		if (!Number.isFinite(tmdbId)) {
			return null;
		}
		return { type: "tmdb", kind: "films", tmdbId };
	}

	if (id.startsWith("tmdb:tv:")) {
		const tmdbId = Number(id.slice("tmdb:tv:".length));
		if (!Number.isFinite(tmdbId)) {
			return null;
		}
		return { type: "tmdb", kind: "tv", tmdbId };
	}

	if (id.startsWith("topic:")) {
		return { type: "topic" };
	}

	if (id.startsWith("qb:")) {
		return { type: "qb" };
	}

	return null;
}

const emptyMeta = (): TitleMeta => ({
	poster: null,
	backdrop: null,
	name: null,
	year: null,
	overview: null,
	genres: [],
	cast: [],
	crew: [],
	similar: [],
	runtimeMinutes: null,
	status: null,
	seasons: null,
	originalName: null,
	alternativeNames: [],
	seasonAirYears: {},
	lastAirYear: null,
});

function metaFromTmdb(meta: TmdbMeta): TitleMeta {
	return {
		poster: meta.poster,
		backdrop: meta.backdrop,
		name: meta.name,
		year: meta.year,
		overview: meta.overview,
		genres: meta.genres,
		cast: meta.cast,
		crew: meta.crew,
		similar: meta.similar,
		runtimeMinutes: meta.runtimeMinutes,
		status: meta.status,
		seasons: meta.seasons,
		originalName: meta.originalName,
		alternativeNames: meta.alternativeNames,
		seasonAirYears: meta.seasonAirYears,
		lastAirYear: meta.lastAirYear,
	};
}

function badgesFor(candidate: TitleTorrentCandidate): TitleTorrentBadge[] {
	const badges: TitleTorrentBadge[] = [];
	if (candidate.resolution) {
		badges.push(candidate.resolution);
	}
	if (candidate.hdr === "HDR") {
		badges.push("HDR");
	}
	return badges;
}

function toTitleTorrent(
	candidate: TitleTorrentCandidate,
	source: "local" | "tracker",
	transfer: TitleTorrent["transfer"],
	matches: boolean,
): TitleTorrent {
	return {
		torrentId: candidate.torrentId,
		topicUrl: candidate.topicUrl,
		title: candidate.title,
		size: candidate.size,
		seeds: candidate.seeds,
		leeches: candidate.leeches,
		qualityScore: scoreTorrentQuality({
			seeds: candidate.seeds,
			size: candidate.size,
			hdr: candidate.hdr,
			resolution: candidate.resolution,
		}),
		badges: badgesFor(candidate),
		source,
		torrentFileUrl: candidate.torrentFileUrl,
		forumId: candidate.forumId,
		transfer,
		matches,
	};
}

function matchTargetFromTitle(title: Title): MatchTarget | null {
	const names = [
		title.meta.name,
		title.meta.originalName,
		...title.meta.alternativeNames,
	].filter((name): name is string => Boolean(name?.trim()));
	if (names.length === 0) {
		return null;
	}
	return {
		kind: title.facet ?? "films",
		year: title.meta.year,
		names,
	};
}

function progressForWatch(
	record: TitleWatchRecord,
	qbTorrents: SyncQbTorrent[],
): TitleWatchView["progress"] {
	if (!record.qbHash) {
		return null;
	}
	const torrent = qbTorrents.find((item) => item.hash === record.qbHash);
	if (!torrent) {
		return null;
	}
	return parseEpisodeProgress(torrent.name);
}

export function toWatchView(
	record: TitleWatchRecord,
	qbTorrents: SyncQbTorrent[],
): TitleWatchView {
	return {
		id: record.id,
		topicUrl: record.topicUrl,
		kind: record.kind,
		watch: record.watch,
		source: record.source,
		season: record.season,
		waitingOutcome: record.waitingOutcome,
		waitingOutcomeDetail: record.waitingOutcomeDetail,
		lastCheckedAt: record.lastCheckedAt,
		lastChangedAt: record.lastChangedAt,
		lastError: record.lastError,
		progress: progressForWatch(record, qbTorrents),
	};
}

/** qB torrents for episode progress; empty when qB is unreachable. */
export async function listQbTorrentsSafe(deps: {
	listQbTorrents: () => Promise<SyncQbTorrent[]>;
}): Promise<SyncQbTorrent[]> {
	try {
		return await deps.listQbTorrents();
	} catch {
		return [];
	}
}

/** Language of the Title name/poster/year stored on a watch. */
const WATCH_META_LANGUAGE = "ru-RU";

/** What a watch remembers about its Title for the watchlist. */
type WatchTitleInfo = {
	name: string;
	poster: string | null;
	year: number | null;
};

export class TitleAddError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "TitleAddError";
	}
}

export class TitleWatchError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "TitleWatchError";
	}
}

export class TitleLinkError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "TitleLinkError";
	}
}

export function createTitleModule(deps: TitleDeps) {
	/** Fresh manual tracking watch for a Topic; callers override what they know. */
	function newWatchRecord(topicUrl: string, kind: TitleKind): TitleWatchRecord {
		return {
			id: crypto.randomUUID(),
			topicUrl,
			titleId: null,
			kind,
			watch: "tracking",
			source: "manual",
			season: null,
			titleName: null,
			poster: null,
			year: null,
			size: null,
			registeredAt: null,
			contentHash: null,
			qbHash: null,
			lastCheckedAt: null,
			lastChangedAt: null,
			lastError: null,
			waitingOutcome: null,
			waitingOutcomeDetail: null,
			createdAt: deps.now(),
		};
	}

	/** Fills the Title's name/poster/year on a watch that doesn't have them yet. */
	async function backfillWatch(
		record: TitleWatchRecord,
		known: WatchTitleInfo | null,
	): Promise<TitleWatchRecord> {
		if (!known) {
			return record;
		}
		const filled: TitleWatchRecord = {
			...record,
			titleName: record.titleName ?? known.name,
			poster: record.poster ?? known.poster,
			year: record.year ?? known.year,
		};
		if (
			filled.titleName === record.titleName &&
			filled.poster === record.poster &&
			filled.year === record.year
		) {
			return record;
		}
		try {
			await deps.saveWatch(filled);
		} catch {
			// best-effort; a missing name only affects the watchlist display
		}
		return filled;
	}

	/**
	 * The Title's watch. `known` fills a watch's missing name/poster/year only
	 * from a `ru-RU` request, the language rows created by «Жду» use.
	 * qB is asked only when there is a watch to show progress for, or a series
	 * to auto-link.
	 */
	async function resolveWatchForTitle(
		titleId: string,
		facet: TitleKind,
		known: WatchTitleInfo | null,
		language: string,
	): Promise<TitleWatchView | null> {
		const byTitle = await deps.loadWatchByTitleId(titleId);
		if (byTitle) {
			const record =
				language === WATCH_META_LANGUAGE
					? await backfillWatch(byTitle, known)
					: byTitle;
			return toWatchView(record, await listQbTorrentsSafe(deps));
		}

		// Auto-linking a qB transfer onto the Title is for series only.
		const query = known?.name.trim();
		if (facet !== "tv" || !query) {
			return null;
		}

		try {
			const linked = await linkAutoWatchToTitle(titleId, query);
			return linked
				? toWatchView(linked, await listQbTorrentsSafe(deps))
				: null;
		} catch {
			return null;
		}
	}

	async function linkAutoWatchToTitle(
		titleId: string,
		query: string,
	): Promise<TitleWatchRecord | null> {
		const [search, live] = await Promise.all([
			deps.searchTorrents(query),
			deps.listTaggedTorrents(),
		]);
		const candidates = search.status === "ok" ? search.tracker : search.local;

		for (const candidate of candidates) {
			const topicId = extractTopicId(candidate.topicUrl) ?? candidate.torrentId;
			const transfer = findTransferForTopic(topicId, live);
			if (!transfer) {
				continue;
			}
			const existing = await deps.loadWatchByTopicUrl(candidate.topicUrl);
			if (!existing || existing.watch === "off") {
				continue;
			}
			if (existing.titleId && existing.titleId !== titleId) {
				continue;
			}
			const linked: TitleWatchRecord = {
				...existing,
				titleId,
				qbHash: existing.qbHash ?? transfer.hash,
			};
			await deps.saveWatch(linked);
			return linked;
		}

		return null;
	}

	/**
	 * A release added by hand for a Title on «Жду»: the waiting watch gets the
	 * Topic (films → downloading, series → tracking). When another row already
	 * watches that Topic for no or the same Title, it takes the Title and the
	 * waiting row goes; a Topic watched for another Title leaves both rows as
	 * they are. Either way the unique `topic_url` never collides.
	 */
	async function attachTopicToWaiting(
		waiting: TitleWatchRecord,
		topicUrl: string,
		kind: TitleKind,
	): Promise<void> {
		const startedState = kind === "films" ? "downloading" : "tracking";
		const changedAt = deps.now();
		const owner = await deps.loadWatchByTopicUrl(topicUrl);

		if (owner && owner.id !== waiting.id) {
			if (owner.titleId !== null && owner.titleId !== waiting.titleId) {
				// The topic is watched for another Title: touch neither row.
				return;
			}
			await deps.saveWatch({
				...owner,
				titleId: waiting.titleId,
				kind: owner.kind ?? kind,
				watch: owner.watch === "off" ? startedState : owner.watch,
				season: owner.season ?? waiting.season,
				titleName: owner.titleName ?? waiting.titleName,
				poster: owner.poster ?? waiting.poster,
				year: owner.year ?? waiting.year,
				lastChangedAt: changedAt,
			});
			await deps.deleteWatch(waiting.id);
		} else {
			await deps.saveWatch({
				...waiting,
				topicUrl,
				kind,
				watch: startedState,
				source: "manual",
				qbHash: null,
				lastChangedAt: changedAt,
				lastError: null,
				waitingOutcome: null,
				waitingOutcomeDetail: null,
			});
		}

		try {
			await deps.recordEvent({
				titleId: waiting.titleId,
				topicUrl,
				kind: "download-started",
				message: null,
			});
		} catch {
			// best-effort; the feed must not fail the add
		}
	}

	async function findTopicInQbForTitle(
		titleId: string,
	): Promise<{ topicUrl: string; qbHash: string; size: number } | null> {
		const title = await module.get({ id: titleId });
		const query = title.meta.name?.trim();
		if (!query) {
			return null;
		}

		const [search, live] = await Promise.all([
			deps.searchTorrents(query),
			deps.listTaggedTorrents(),
		]);

		const candidates = search.status === "ok" ? search.tracker : search.local;

		for (const candidate of candidates) {
			const topicId = extractTopicId(candidate.topicUrl) ?? candidate.torrentId;
			const transfer = findTransferForTopic(topicId, live);
			if (transfer) {
				return {
					topicUrl: candidate.topicUrl,
					qbHash: transfer.hash,
					size: candidate.size,
				};
			}
		}

		return null;
	}

	const module = {
		resolve(ref: TitleRef): { id: string } {
			return { id: titleRefToId(ref) };
		},

		async get(
			input: ({ id: string } | { ref: TitleRef }) & { language?: string },
		): Promise<Title> {
			const id = "id" in input ? input.id : titleRefToId(input.ref);
			const language = input.language ?? "ru-RU";
			const parsed = parseTitleId(id);

			if (!parsed) {
				return {
					id,
					facet: null,
					metaStatus: "empty",
					meta: emptyMeta(),
					ratings: await deps.getRatings({ titleId: id }),
					watch: null,
				};
			}

			if (parsed.type === "topic" || parsed.type === "qb") {
				return {
					id,
					facet: null,
					metaStatus: "empty",
					meta: emptyMeta(),
					ratings: await deps.getRatings({ titleId: id }),
					watch: null,
				};
			}

			const outcome = await deps.fetchTmdbMeta(
				parsed.kind,
				parsed.tmdbId,
				language,
			);

			if (outcome.status !== "ok") {
				const facet = parsed.kind;
				return {
					id,
					facet,
					metaStatus: "degraded",
					meta: emptyMeta(),
					ratings: await deps.getRatings({
						titleId: id,
						tmdbKind: parsed.kind,
						tmdbId: parsed.tmdbId,
					}),
					watch: await resolveWatchForTitle(id, facet, null, language),
				};
			}

			const metaStatus: TitleMetaStatus = "ok";
			const ratings = await deps.getRatings({
				titleId: id,
				tmdbKind: parsed.kind,
				tmdbId: parsed.tmdbId,
				tmdbVoteAverage: outcome.meta.voteAverage,
				tmdbVoteCount: outcome.meta.voteCount,
			});

			return {
				id,
				facet: parsed.kind,
				metaStatus,
				meta: metaFromTmdb(outcome.meta),
				ratings,
				watch: await resolveWatchForTitle(
					id,
					parsed.kind,
					{
						name: outcome.meta.name,
						poster: outcome.meta.poster,
						year: outcome.meta.year,
					},
					language,
				),
			};
		},

		async torrents(input: {
			id: string;
			query?: string;
			language?: string;
		}): Promise<TitleTorrentsResult> {
			const title = await this.get({
				id: input.id,
				language: input.language,
			});
			const query = input.query?.trim() || title.meta.name?.trim();
			if (!query) {
				return { status: "empty", items: [] };
			}

			const [search, live] = await Promise.all([
				deps.searchTorrents(query),
				deps.listTaggedTorrents(),
			]);

			let source: "local" | "tracker" = "local";
			let status: TitleTorrentsResult["status"] = "degraded";
			let candidates: TitleTorrentCandidate[] = search.local;

			if (search.status === "ok") {
				source = "tracker";
				status = "ok";
				candidates = search.tracker;
			} else if (search.local.length === 0) {
				return { status: "empty", items: [] };
			}

			const target = matchTargetFromTitle(title);

			const items = candidates
				.map((candidate) => {
					const topicId =
						extractTopicId(candidate.topicUrl) ?? candidate.torrentId;
					const transfer = findTransferForTopic(topicId, live);
					const matches =
						target === null ||
						releaseMatchesTitle(parseReleaseTitle(candidate.title), target);
					return toTitleTorrent(candidate, source, transfer, matches);
				})
				.sort((a, b) => b.qualityScore - a.qualityScore);

			return { status, items };
		},

		async add(input: {
			torrentFileUrl: string;
			kind: TitleKind;
			topicUrl: string;
			titleId?: string;
		}): Promise<{ ok: true }> {
			const topicId = extractTopicId(input.topicUrl);
			if (!topicId) {
				throw new TitleAddError("Invalid topic URL: missing topic id");
			}

			await deps.addFromTracker(input.torrentFileUrl, input.kind, [
				topicTag(topicId),
			]);

			// Save topic link for both films and tv when titleId is provided
			if (input.titleId) {
				await deps.upsertLink(`topic:${topicId}`, input.titleId);
				const titleWatch = await deps.loadWatchByTitleId(input.titleId);
				if (titleWatch?.watch === "waiting") {
					await attachTopicToWaiting(titleWatch, input.topicUrl, input.kind);
					return { ok: true };
				}
			}

			if (input.kind === "tv") {
				const existing = await deps.loadWatchByTopicUrl(input.topicUrl);
				if (
					!existing ||
					existing.watch === "off" ||
					(input.titleId && !existing.titleId)
				) {
					const base = existing ?? newWatchRecord(input.topicUrl, "tv");
					await deps.saveWatch({
						...base,
						titleId: input.titleId ?? base.titleId,
						kind: base.kind ?? "tv",
						watch:
							existing && existing.watch !== "off"
								? existing.watch
								: "tracking",
					});
				}
			}

			return { ok: true };
		},

		async setWatch(input: {
			id: string;
			watch: "tracking" | "paused";
			topicUrl?: string;
		}): Promise<{ ok: true }> {
			// A Title may still have several rows (one per season topic, old
			// model): a given topic picks its own row, so another row is never
			// re-pointed at it (or collides with it on the unique topic_url).
			const byTopic = input.topicUrl
				? await deps.loadWatchByTopicUrl(input.topicUrl)
				: null;
			const existing = byTopic ?? (await deps.loadWatchByTitleId(input.id));
			let topicUrl = input.topicUrl ?? existing?.topicUrl ?? null;
			let qbHash = existing?.qbHash ?? null;
			let size = existing?.size ?? null;

			if (!topicUrl) {
				const found = await findTopicInQbForTitle(input.id);
				if (!found) {
					throw new TitleWatchError(
						"Нет раздачи сериала в qBittorrent для follow",
					);
				}
				topicUrl = found.topicUrl;
				qbHash = found.qbHash;
				size = found.size;
			}

			const previous = existing ?? (await deps.loadWatchByTopicUrl(topicUrl));

			const base = previous ?? newWatchRecord(topicUrl, "tv");
			await deps.saveWatch({
				...base,
				topicUrl,
				titleId: input.id,
				kind: base.kind ?? "tv",
				watch: input.watch,
				size: base.size ?? size,
				qbHash: base.qbHash ?? qbHash,
			});

			return { ok: true };
		},

		async checkNow(input: { id: string }): Promise<CheckResult> {
			let record = await deps.loadWatchByTitleId(input.id);
			if (!record) {
				const found = await findTopicInQbForTitle(input.id);
				if (!found) {
					return {
						status: "failed",
						checkedAt: deps.now(),
						message: "Нет follow или раздачи в qBittorrent",
					};
				}
				record = {
					...newWatchRecord(found.topicUrl, "tv"),
					titleId: input.id,
					size: found.size,
					qbHash: found.qbHash,
				};
				await deps.saveWatch(record);
			} else if (!record.titleId) {
				await deps.saveWatch({ ...record, titleId: input.id });
			}

			if (!record.topicUrl) {
				return {
					status: "failed",
					checkedAt: deps.now(),
					message: "Раздача для этого тайтла ещё не найдена",
				};
			}

			return module.checkTopic({
				topicUrl: record.topicUrl,
				titleId: input.id,
			});
		},

		/**
		 * Checks one Topic now — the row that watches `topicUrl`, whatever other
		 * rows its Title has. Same queue path as the nightly worker: a manual
		 * WatchTask drained through processWatchTask instead of an ad-hoc
		 * checkTopicNow. Events are recorded inside checkTopicNow via the bound
		 * recordEvent dep.
		 */
		async checkTopic(input: {
			topicUrl: string;
			titleId: string | null;
		}): Promise<CheckResult> {
			const task = await deps.enqueueWatchTask({
				topicUrl: input.topicUrl,
				titleId: input.titleId,
				trigger: "manual",
			});
			const outcome = await deps.processWatchTask(task.id);

			if (outcome.outcome === "processed") {
				return outcome.checkResult;
			}

			return {
				status: "failed",
				checkedAt: deps.now(),
				message: "Не удалось выполнить проверку задачи",
			};
		},

		/**
		 * Map live qB hash → Title id. Priority: manual `qb:<hash>` link, then a
		 * `topic:<id>` link recorded on add, then a TitleWatch for the same
		 * qB hash or Topic.
		 */
		async transferLinks(): Promise<{ links: Record<string, string> }> {
			const [allLinks, qbTorrents, watches] = await Promise.all([
				deps.loadAllLinks(),
				deps.listTaggedTorrents(),
				deps.listTitledWatches(),
			]);

			const watchByHash = new Map<string, string>();
			const watchByTopicId = new Map<string, string>();
			for (const watch of watches) {
				if (watch.qbHash) {
					watchByHash.set(watch.qbHash, watch.titleId);
				}
				const topicId = watch.topicUrl ? extractTopicId(watch.topicUrl) : null;
				if (topicId) {
					watchByTopicId.set(topicId, watch.titleId);
				}
			}

			const links: Record<string, string> = {};
			for (const torrent of qbTorrents) {
				const topicId = extractTopicIdFromTags(torrent.tags);
				const titleId =
					allLinks[`qb:${torrent.hash}`] ??
					(topicId ? allLinks[`topic:${topicId}`] : undefined) ??
					watchByHash.get(torrent.hash) ??
					(topicId ? watchByTopicId.get(topicId) : undefined);
				if (titleId) {
					links[torrent.hash] = titleId;
				}
			}

			return { links };
		},

		async linkTransfer(input: {
			hash: string;
			titleId: string;
		}): Promise<{ ok: true }> {
			if (!input.titleId.startsWith("tmdb:")) {
				throw new TitleLinkError("Only TMDB titles can be linked");
			}

			await deps.upsertLink(`qb:${input.hash}`, input.titleId);
			return { ok: true };
		},
	};

	return module;
}

export type TitleModule = ReturnType<typeof createTitleModule>;

export type { FetchTmdbMetaOutcome, TitleDeps } from "./title.types";
export type { CheckResult } from "./watch/check-topic-now";
