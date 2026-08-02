import { describe, expect, test } from "bun:test";
import type { TitleWatchEvent } from "../title/title-watch-event";
import { createHome } from "./home";

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
