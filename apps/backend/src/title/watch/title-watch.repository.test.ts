import { describe, expect, test } from "bun:test";
import type { TitleWatchRecord } from "./check-topic-now";
import {
	fromWatchRow,
	titleWatchByTitleIdQuery,
	toWatchRow,
} from "./title-watch.repository";

const waitingRecord: TitleWatchRecord = {
	id: "8f7b1c2e-0000-4000-8000-000000000001",
	topicUrl: null,
	titleId: "tmdb:tv:1399",
	kind: "tv",
	watch: "waiting",
	source: "manual",
	season: 5,
	titleName: "Игра престолов",
	poster: "https://image.tmdb.org/t/p/w342/poster.jpg",
	year: 2011,
	size: null,
	registeredAt: null,
	contentHash: null,
	qbHash: null,
	lastCheckedAt: "2026-10-17T08:00:00.000Z",
	lastChangedAt: null,
	lastError: null,
	waitingOutcome: "below-resolution",
	waitingOutcomeDetail: "720p",
	createdAt: "2026-10-16T21:30:00.000Z",
};

describe("title watch row mapping", () => {
	test("round-trips a waiting record without a topic", () => {
		expect(fromWatchRow(toWatchRow(waitingRecord))).toEqual(waitingRecord);
	});

	test("maps ISO dates to Date columns", () => {
		const row = toWatchRow({
			...waitingRecord,
			watch: "tracking",
			topicUrl: "https://rutracker.org/forum/viewtopic.php?t=100",
			registeredAt: "2026-10-01T10:00:00.000Z",
		});
		expect(row.id).toBe(waitingRecord.id);
		expect(row.topicUrl).toBe(
			"https://rutracker.org/forum/viewtopic.php?t=100",
		);
		expect(row.registeredAt).toEqual(new Date("2026-10-01T10:00:00.000Z"));
		expect(row.lastCheckedAt).toEqual(new Date("2026-10-17T08:00:00.000Z"));
		expect(row.createdAt).toEqual(new Date("2026-10-16T21:30:00.000Z"));
		expect(row.lastChangedAt).toBeNull();
	});
});

describe("loadWatchByTitleId order", () => {
	test("active first, then newest created, then most recently updated", () => {
		const { sql, params } = titleWatchByTitleIdQuery("tmdb:tv:1399").toSQL();
		expect(sql).toContain(
			'order by "title_watches"."watch" = \'off\' asc, "title_watches"."created_at" desc, "title_watches"."updated_at" desc',
		);
		expect(params).toContain("tmdb:tv:1399");
	});
});
