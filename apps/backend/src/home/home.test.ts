import { describe, expect, test } from "bun:test";
import type { TitleWatchEvent } from "../title/title-watch-event";
import { averageSpeedsByDay, buildTransferDays, createHome } from "./home";

function watchEvent(partial: Partial<TitleWatchEvent> = {}): TitleWatchEvent {
	return {
		id: "evt-1",
		titleId: "tmdb:tv:1",
		topicUrl: "https://rutracker.org/forum/viewtopic.php?t=55",
		kind: "torrent-updated",
		message: null,
		previousSize: null,
		newSize: null,
		createdAt: "2026-08-02T10:00:00.000Z",
		...partial,
	};
}

describe("home.compose", () => {
	test("returns transferStats ok when qB provides data", async () => {
		const home = createHome({
			getTransferStats: async () => ({
				downloadedBytes: 1_000_000_000,
				uploadedBytes: 500_000_000,
				downloadSpeed: 1_024_000,
				uploadSpeed: 512_000,
				freeSpaceBytes: 100_000_000_000,
				ratio: 0.5,
			}),
			getDiscoverFeed: async () => [],
			getTitleWatchEvents: async () => [],
	});

		const response = await home.compose({
			widgets: [{ key: "transfer", widget: "transferStats" }],
		});

		expect(response).toEqual({
			widgets: {
				transfer: {
					status: "ok",
					data: {
						downloadedBytes: 1_000_000_000,
						uploadedBytes: 500_000_000,
						downloadSpeed: 1_024_000,
						uploadSpeed: 512_000,
						freeSpaceBytes: 100_000_000_000,
						ratio: 0.5,
					},
				},
			},
		});
	});

	test("returns unavailable when qB is missing", async () => {
		const home = createHome({
			getTransferStats: async () => null,
			getDiscoverFeed: async () => [],
			getTitleWatchEvents: async () => [],
	});

		const response = await home.compose({
			widgets: [{ key: "transfer", widget: "transferStats" }],
		});

		expect(response).toEqual({
			widgets: {
				transfer: { status: "unavailable" },
			},
		});
	});

	test("returns discoverFeed ok with title cards", async () => {
		const home = createHome({
			getTransferStats: async () => null,
			getDiscoverFeed: async () => [
				{
					titleId: "tmdb:films:1",
					name: "Dune",
					poster: "https://image.tmdb.org/t/p/w342/dune.jpg",
					year: 2021,
					kind: "films",
				},
			],
			getTitleWatchEvents: async () => [],
	});

		const response = await home.compose({
			widgets: [{ key: "discover", widget: "discoverFeed" }],
		});

		expect(response).toEqual({
			widgets: {
				discover: {
					status: "ok",
					data: {
						items: [
							{
								titleId: "tmdb:films:1",
								name: "Dune",
								poster: "https://image.tmdb.org/t/p/w342/dune.jpg",
								year: 2021,
								kind: "films",
							},
						],
					},
				},
			},
		});
	});

	test("returns discoverFeed unavailable when TMDB is missing", async () => {
		const home = createHome({
			getTransferStats: async () => ({
				downloadedBytes: 100,
				uploadedBytes: 50,
			}),
			getDiscoverFeed: async () => null,
			getTitleWatchEvents: async () => [],
	});

		const response = await home.compose({
			widgets: [
				{ key: "transfer", widget: "transferStats" },
				{ key: "discover", widget: "discoverFeed" },
			],
		});

		expect(response.widgets.transfer?.status).toBe("ok");
		expect(response.widgets.discover).toEqual({ status: "unavailable" });
	});

	test("returns discoverFeed empty when TMDB has no items", async () => {
		const home = createHome({
			getTransferStats: async () => null,
			getDiscoverFeed: async () => [],
			getTitleWatchEvents: async () => [],
	});

		const response = await home.compose({
			widgets: [{ key: "discover", widget: "discoverFeed" }],
		});

		expect(response.widgets.discover).toEqual({ status: "empty" });
	});

	test("ignores unknown widgets gracefully", async () => {
		const home = createHome({
			getTransferStats: async () => ({
				downloadedBytes: 100,
				uploadedBytes: 50,
			}),
			getDiscoverFeed: async () => [],
			getTitleWatchEvents: async () => [],
	});

		const response = await home.compose({
			widgets: [
				{ key: "transfer", widget: "transferStats" },
				{ key: "mystery", widget: "unknownWidget" },
			],
		});

		expect(response.widgets).toEqual({
			transfer: {
				status: "ok",
				data: {
					downloadedBytes: 100,
					uploadedBytes: 50,
				},
			},
		});
		expect(response.widgets.mystery).toBeUndefined();
	});

	test("attaches history to transferStats when provided", async () => {
		const history = [
			{ date: "2026-08-01", downloadedBytes: 10, uploadedBytes: 20 },
			{ date: "2026-08-02", downloadedBytes: null, uploadedBytes: null },
		];
		const home = createHome({
			getTransferStats: async () => ({
				downloadedBytes: 100,
				uploadedBytes: 50,
			}),
			getTransferHistory: async () => history,
			getDiscoverFeed: async () => [],
			getTitleWatchEvents: async () => [],
	});

		const response = await home.compose({
			widgets: [{ key: "transfer", widget: "transferStats" }],
		});

		expect(response.widgets.transfer).toEqual({
			status: "ok",
			data: {
				downloadedBytes: 100,
				uploadedBytes: 50,
				history,
			},
		});
	});

	test("keeps transferStats ok when history lookup fails", async () => {
		const home = createHome({
			getTransferStats: async () => ({
				downloadedBytes: 100,
				uploadedBytes: 50,
			}),
			getTransferHistory: async () => {
				throw new Error("db down");
			},
			getDiscoverFeed: async () => [],
			getTitleWatchEvents: async () => [],
	});

		const response = await home.compose({
			widgets: [{ key: "transfer", widget: "transferStats" }],
		});

		expect(response.widgets.transfer).toEqual({
			status: "ok",
			data: {
				downloadedBytes: 100,
				uploadedBytes: 50,
			},
		});
	});

	test("attaches recentSpeeds when provided", async () => {
		const recentSpeeds = [
			{ t: "2026-08-02T11:00:00.000Z", downloadSpeed: 10, uploadSpeed: 20 },
			{ t: "2026-08-02T11:00:15.000Z", downloadSpeed: 30, uploadSpeed: 40 },
		];
		const home = createHome({
			getTransferStats: async () => ({
				downloadedBytes: 100,
				uploadedBytes: 50,
			}),
			getRecentSpeeds: async () => recentSpeeds,
			getDiscoverFeed: async () => [],
			getTitleWatchEvents: async () => [],
	});

		const response = await home.compose({
			widgets: [{ key: "transfer", widget: "transferStats" }],
		});

		expect(response.widgets.transfer).toEqual({
			status: "ok",
			data: {
				downloadedBytes: 100,
				uploadedBytes: 50,
				recentSpeeds,
			},
		});
	});

	test("returns titleWatchFeed ok with events when non-empty", async () => {
		const home = createHome({
			getTransferStats: async () => null,
			getDiscoverFeed: async () => [],
			getTitleWatchEvents: async () => [
				watchEvent({ id: "evt-2", createdAt: "2026-08-02T12:00:00.000Z" }),
				watchEvent({
					id: "evt-1",
					kind: "check-failed",
					message: "tracker down",
					createdAt: "2026-08-02T10:00:00.000Z",
				}),
			],
		});

		const response = await home.compose({
			widgets: [{ key: "feed", widget: "titleWatchFeed" }],
		});

		expect(response).toEqual({
			widgets: {
				feed: {
					status: "ok",
					data: {
						items: [
							{
								id: "evt-2",
								titleId: "tmdb:tv:1",
								kind: "torrent-updated",
								message: null,
								createdAt: "2026-08-02T12:00:00.000Z",
							},
							{
								id: "evt-1",
								titleId: "tmdb:tv:1",
								kind: "check-failed",
								message: "tracker down",
								createdAt: "2026-08-02T10:00:00.000Z",
							},
						],
					},
				},
			},
		});
	});

	test("returns titleWatchFeed empty when there are no events (empty follow list)", async () => {
		const home = createHome({
			getTransferStats: async () => null,
			getDiscoverFeed: async () => [],
			getTitleWatchEvents: async () => [],
		});

		const response = await home.compose({
			widgets: [{ key: "feed", widget: "titleWatchFeed" }],
		});

		expect(response.widgets.feed).toEqual({ status: "empty" });
	});

	test("skips titleWatchFeed events without a linked titleId", async () => {
		const home = createHome({
			getTransferStats: async () => null,
			getDiscoverFeed: async () => [],
			getTitleWatchEvents: async () => [
				watchEvent({ id: "evt-unlinked", titleId: null }),
			],
		});

		const response = await home.compose({
			widgets: [{ key: "feed", widget: "titleWatchFeed" }],
		});

		expect(response.widgets.feed).toEqual({ status: "empty" });
	});
});

describe("buildTransferDays", () => {
	const today = "2026-08-05";

	test("computes per-day diffs from consecutive snapshots", () => {
		const days = buildTransferDays(
			[
				{ day: "2026-08-03", downloadedBytes: 100, uploadedBytes: 200 },
				{ day: "2026-08-04", downloadedBytes: 150, uploadedBytes: 330 },
				{ day: "2026-08-05", downloadedBytes: 150, uploadedBytes: 400 },
			],
			2,
			today,
		);

		expect(days).toEqual([
			{ date: "2026-08-04", downloadedBytes: 50, uploadedBytes: 130 },
			{ date: "2026-08-05", downloadedBytes: 0, uploadedBytes: 70 },
		]);
	});

	test("fills the full range and marks days without snapshots as unknown", () => {
		const days = buildTransferDays(
			[
				{ day: "2026-08-02", downloadedBytes: 100, uploadedBytes: 100 },
				{ day: "2026-08-03", downloadedBytes: 110, uploadedBytes: 140 },
				// 2026-08-04 missing — backend was off
				{ day: "2026-08-05", downloadedBytes: 200, uploadedBytes: 300 },
			],
			4,
			today,
		);

		expect(days).toEqual([
			{ date: "2026-08-02", downloadedBytes: null, uploadedBytes: null },
			{ date: "2026-08-03", downloadedBytes: 10, uploadedBytes: 40 },
			{ date: "2026-08-04", downloadedBytes: null, uploadedBytes: null },
			// The diff across the gap stays unknown instead of spiking one day.
			{ date: "2026-08-05", downloadedBytes: null, uploadedBytes: null },
		]);
	});

	test("treats decreasing counters (qBittorrent reset) as unknown", () => {
		const days = buildTransferDays(
			[
				{ day: "2026-08-04", downloadedBytes: 500, uploadedBytes: 500 },
				{ day: "2026-08-05", downloadedBytes: 20, uploadedBytes: 30 },
			],
			1,
			today,
		);

		expect(days).toEqual([
			{ date: "2026-08-05", downloadedBytes: null, uploadedBytes: null },
		]);
	});
});

describe("averageSpeedsByDay", () => {
	test("averages samples per UTC day and rounds", () => {
		const avg = averageSpeedsByDay([
			{
				sampledAt: new Date("2026-08-04T10:00:00Z"),
				downloadSpeed: 100,
				uploadSpeed: 300,
			},
			{
				sampledAt: new Date("2026-08-04T22:00:00Z"),
				downloadSpeed: 201,
				uploadSpeed: 100,
			},
			{
				sampledAt: new Date("2026-08-05T08:00:00Z"),
				downloadSpeed: 50,
				uploadSpeed: 25,
			},
		]);

		expect(avg.get("2026-08-04")).toEqual({
			avgDownloadSpeed: 151, // (100 + 201) / 2 = 150.5 → 151
			avgUploadSpeed: 200,
		});
		expect(avg.get("2026-08-05")).toEqual({
			avgDownloadSpeed: 50,
			avgUploadSpeed: 25,
		});
		expect(avg.size).toBe(2);
	});

	test("returns empty map for no samples", () => {
		expect(averageSpeedsByDay([]).size).toBe(0);
	});
});
