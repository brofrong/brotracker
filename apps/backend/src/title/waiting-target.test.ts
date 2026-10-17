import { describe, expect, test } from "bun:test";
import type { Title, TitleKind } from "./title.types";
import { buildWaitingTarget, searchableOriginalName } from "./waiting-target";
import type { TitleWatchRecord } from "./watch/check-topic-now";

const title = (kind: TitleKind, meta: Partial<Title["meta"]> = {}): Title => ({
	id: `tmdb:${kind}:1`,
	facet: kind,
	metaStatus: "ok",
	meta: {
		poster: null,
		backdrop: null,
		name: "Одиссея",
		year: 2026,
		overview: null,
		genres: [],
		cast: [],
		crew: [],
		similar: [],
		runtimeMinutes: null,
		status: null,
		seasons: null,
		originalName: "The Odyssey",
		alternativeNames: [],
		...meta,
	},
	ratings: [],
	watch: null,
});

const watch = (season: number | null = null) =>
	({ season }) as unknown as TitleWatchRecord;

describe("searchableOriginalName", () => {
	test("Latin and Cyrillic originals count", () => {
		expect(searchableOriginalName({ originalName: " The Odyssey " })).toBe(
			"The Odyssey",
		);
		expect(searchableOriginalName({ originalName: "Брат" })).toBe("Брат");
	});

	test("originals without Latin or Cyrillic letters don't", () => {
		expect(searchableOriginalName({ originalName: "오징어 게임" })).toBeNull();
		expect(searchableOriginalName({ originalName: null })).toBeNull();
	});
});

describe("buildWaitingTarget", () => {
	test("film: name + year and name, for the original and the Russian name", () => {
		const target = buildWaitingTarget(
			title("films", { alternativeNames: ["Odyssey"] }),
			watch(),
		);
		expect(target).toEqual({
			kind: "films",
			year: 2026,
			names: ["Одиссея", "The Odyssey", "Odyssey"],
			season: null,
			queries: ["The Odyssey 2026", "The Odyssey", "Одиссея 2026", "Одиссея"],
		});
	});

	test("series: '<name> сезон <season>' using the watch's season", () => {
		const target = buildWaitingTarget(
			title("tv", {
				name: "Одни из нас",
				originalName: "The Last of Us",
				seasons: 3,
			}),
			watch(2),
		);
		expect(target?.season).toBe(2);
		expect(target?.queries).toEqual([
			"The Last of Us сезон 2",
			"Одни из нас сезон 2",
		]);
	});

	test("an unsearchable or identical original adds no queries", () => {
		expect(
			buildWaitingTarget(title("films", { originalName: "오디세이" }), watch())
				?.queries,
		).toEqual(["Одиссея 2026", "Одиссея"]);
		expect(
			buildWaitingTarget(title("films", { originalName: "одиссея" }), watch())
				?.queries,
		).toEqual(["одиссея 2026", "одиссея"]);
	});

	test("no names or no facet → null", () => {
		expect(
			buildWaitingTarget(
				title("films", { name: null, originalName: null }),
				watch(),
			),
		).toBeNull();
		expect(
			buildWaitingTarget({ ...title("films"), facet: null }, watch()),
		).toBeNull();
	});
});
