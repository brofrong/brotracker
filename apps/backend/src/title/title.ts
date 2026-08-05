import { scoreTorrentQuality } from "../torrent/quality-score";
import type { CheckResult, TitleWatchRecord } from "./watch/check-topic-now";
import { parseEpisodeProgress } from "./watch/episode-progress";
import type { SyncQbTorrent } from "./watch/sync-watches-from-qb";
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
import { extractTopicId, findTransferForTopic, topicTag } from "./topic-tag";

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
		topicUrl: record.topicUrl,
		watch: record.watch,
		source: record.source,
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

export function createTitleModule(deps: TitleDeps) {
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
		const candidates =
			search.status === "ok" ? search.tracker : search.local;

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

		const candidates =
			search.status === "ok" ? search.tracker : search.local;

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

		async get(input: { id: string } | { ref: TitleRef }): Promise<Title> {
			const id = "id" in input ? input.id : titleRefToId(input.ref);
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

			const outcome = await deps.fetchTmdbMeta(parsed.kind, parsed.tmdbId);

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
		}): Promise<TitleTorrentsResult> {
			const title = await this.get({ id: input.id });
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

			const items = candidates
				.map((candidate) => {
					const topicId =
						extractTopicId(candidate.topicUrl) ?? candidate.torrentId;
					const transfer = findTransferForTopic(topicId, live);
					return toTitleTorrent(candidate, source, transfer);
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

			if (input.kind === "tv") {
				const existing = await deps.loadWatchByTopicUrl(input.topicUrl);
				if (
					!existing ||
					existing.watch === "off" ||
					(input.titleId && !existing.titleId)
				) {
					await deps.saveWatch({
						topicUrl: input.topicUrl,
						titleId: input.titleId ?? existing?.titleId ?? null,
						watch:
							existing && existing.watch !== "off"
								? existing.watch
								: "tracking",
						source: existing?.source ?? "manual",
						size: existing?.size ?? null,
						registeredAt: existing?.registeredAt ?? null,
						contentHash: existing?.contentHash ?? null,
						qbHash: existing?.qbHash ?? null,
						lastCheckedAt: existing?.lastCheckedAt ?? null,
						lastChangedAt: existing?.lastChangedAt ?? null,
						lastError: existing?.lastError ?? null,
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

			await deps.saveWatch({
				topicUrl,
				titleId: input.id,
				watch: input.watch,
				source: previous?.source ?? "manual",
				size: previous?.size ?? size,
				registeredAt: previous?.registeredAt ?? null,
				contentHash: previous?.contentHash ?? null,
				qbHash: previous?.qbHash ?? qbHash,
				lastCheckedAt: previous?.lastCheckedAt ?? null,
				lastChangedAt: previous?.lastChangedAt ?? null,
				lastError: previous?.lastError ?? null,
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
					topicUrl: found.topicUrl,
					titleId: input.id,
					watch: "tracking",
					source: "manual",
					size: found.size,
					registeredAt: null,
					contentHash: null,
					qbHash: found.qbHash,
					lastCheckedAt: null,
					lastChangedAt: null,
					lastError: null,
				};
				await deps.saveWatch(record);
			} else if (!record.titleId) {
				await deps.saveWatch({ ...record, titleId: input.id });
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
	};

	return module;
}

export type TitleModule = ReturnType<typeof createTitleModule>;

export type { CheckResult } from "./watch/check-topic-now";
export type { FetchTmdbMetaOutcome, TitleDeps } from "./title.types";
