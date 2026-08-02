import type {
	Title,
	TitleDeps,
	TitleKind,
	TitleMeta,
	TitleMetaStatus,
	TitleRef,
	TmdbMeta,
} from "./title.types";

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
	};
}

export type TitleModule = ReturnType<typeof createTitleModule>;

export type { TitleDeps, FetchTmdbMetaOutcome } from "./title.types";
