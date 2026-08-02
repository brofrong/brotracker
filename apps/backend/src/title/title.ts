import { scoreTorrentQuality } from "../torrent/quality-score";
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
	TmdbMeta,
} from "./title.types";
import {
	extractTopicId,
	findTransferForTopic,
	topicTag,
} from "./topic-tag";

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
	name: null,
	year: null,
	overview: null,
	genres: [],
	cast: [],
	crew: [],
	runtimeMinutes: null,
	status: null,
	seasons: null,
});

function metaFromTmdb(meta: TmdbMeta): TitleMeta {
	return {
		poster: meta.poster,
		name: meta.name,
		year: meta.year,
		overview: meta.overview,
		genres: meta.genres,
		cast: meta.cast,
		crew: meta.crew,
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

export class TitleAddError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "TitleAddError";
	}
}

export function createTitleModule(deps: TitleDeps) {
	return {
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
				};
			}

			if (parsed.type === "topic" || parsed.type === "qb") {
				return {
					id,
					facet: null,
					metaStatus: "empty",
					meta: emptyMeta(),
					ratings: await deps.getRatings({ titleId: id }),
				};
			}

			const outcome = await deps.fetchTmdbMeta(parsed.kind, parsed.tmdbId);

			if (outcome.status !== "ok") {
				return {
					id,
					facet: parsed.kind,
					metaStatus: "degraded",
					meta: emptyMeta(),
					ratings: await deps.getRatings({
						titleId: id,
						tmdbKind: parsed.kind,
						tmdbId: parsed.tmdbId,
					}),
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
			};
		},

		async torrents(input: { id: string }): Promise<TitleTorrentsResult> {
			const title = await this.get({ id: input.id });
			const query = title.meta.name?.trim();
			if (!query) {
				return { status: "empty", items: [] };
			}

			const [tracker, local, live] = await Promise.all([
				deps.searchTracker(query),
				deps.searchLocal(query),
				deps.listTaggedTorrents(),
			]);

			let source: "local" | "tracker" = "local";
			let status: TitleTorrentsResult["status"] = "degraded";
			let candidates: TitleTorrentCandidate[] = local;

			if (tracker.status === "ok") {
				source = "tracker";
				status = "ok";
				candidates = tracker.results;
			} else if (local.length === 0) {
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
		}): Promise<{ ok: true }> {
			const topicId = extractTopicId(input.topicUrl);
			if (!topicId) {
				throw new TitleAddError("Invalid topic URL: missing topic id");
			}

			await deps.addFromTracker(input.torrentFileUrl, input.kind, [
				topicTag(topicId),
			]);

			return { ok: true };
		},
	};
}

export type TitleModule = ReturnType<typeof createTitleModule>;

export type { TitleDeps, FetchTmdbMetaOutcome } from "./title.types";
