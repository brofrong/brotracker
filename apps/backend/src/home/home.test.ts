import { describe, expect, test } from "bun:test";
import { createHome } from "./home";

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
});
