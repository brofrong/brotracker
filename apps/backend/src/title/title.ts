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

function toWatchView(
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

	async function resolveWatchForTitle(
		titleId: string,
		facet: TitleKind | null,
		titleName: string | null,
	): Promise<TitleWatchView | null> {
		if (facet !== "tv") {
			return null;
		}

		let qbTorrents: SyncQbTorrent[] = [];
		try {
			qbTorrents = await deps.listQbTorrents();
		} catch {
			qbTorrents = [];
		}

		const byTitle = await deps.loadWatchByTitleId(titleId);
		if (byTitle) {
			return toWatchView(byTitle, qbTorrents);
		}

		if (!titleName?.trim()) {
			return null;
		}

		try {
			const linked = await linkAutoWatchToTitle(titleId, titleName.trim());
			return linked ? toWatchView(linked, qbTorrents) : null;
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
					watch: await resolveWatchForTitle(id, facet, null),
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
				watch: await resolveWatchForTitle(id, parsed.kind, outcome.meta.name),
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
			const existing = await deps.loadWatchByTitleId(input.id);
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

			// Same queue path as the nightly worker: create a manual WatchTask
			// and drain it through processWatchTask instead of calling
			// checkTopicNow ad hoc. Events are recorded inside checkTopicNow
			// via the bound recordEvent dep.
			const task = await deps.enqueueWatchTask({
				topicUrl: record.topicUrl,
				titleId: input.id,
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
