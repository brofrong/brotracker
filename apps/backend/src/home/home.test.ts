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

	test("ignores unknown widgets gracefully", async () => {
		const home = createHome({
			getTransferStats: async () => ({
				downloadedBytes: 100,
				uploadedBytes: 50,
			}),
		});

		const response = await home.compose({
			widgets: [
				{ key: "transfer", widget: "transferStats" },
				{ key: "discover", widget: "discoverFeed" },
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
		expect(response.widgets.discover).toBeUndefined();
	});
});
