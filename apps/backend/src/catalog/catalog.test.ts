import { describe, expect, test } from "bun:test";
import type { SearchResult } from "@brotracker/rutracker-ts/tracker/tracker-interface";
import { createCatalog, type CatalogDeps } from "./catalog";

const hit = (overrides: Partial<SearchResult> = {}): SearchResult => ({
	torrentId: "100",
	title: "Example Film",
	category: "films",
	forumId: "1",
	authorId: "2",
	size: 1e9,
	seeds: 10,
	leeches: 1,
	downloads: 5,
	date: new Date("2024-01-01T00:00:00Z"),
	torrentFileUrl: "https://rutracker.org/forum/dl.php?t=100",
	topicUrl: "https://rutracker.org/forum/viewtopic.php?t=100",
	hdr: "SDR",
	resolution: "1080p",
	...overrides,
});

function unusedTrackerDeps(): Pick<
	CatalogDeps,
	| "searchTracker"
	| "upsertFromTracker"
	| "loadImageKeys"
	| "enqueueCoverFetch"
> {
	return {
		searchTracker: async () => {
			throw new Error("tracker should not be used for local search");
		},
		upsertFromTracker: async () => {
			throw new Error("upsert should not run for local search");
		},
		loadImageKeys: async () => new Map(),
		enqueueCoverFetch: () => {
			throw new Error("cover enqueue should not run for local search");
		},
	};
}

describe("catalog.search", () => {
	test("returns local hits with cover URLs from image keys", async () => {
		const catalog = createCatalog({
			normalizeTitle: (q) => q.trim().toLowerCase(),
			searchLocal: async () => [
				{ ...hit({ torrentId: "1" }), imageKey: "covers/1.webp" },
				{ ...hit({ torrentId: "2", title: "No Cover" }), imageKey: null },
			],
			publicUrl: (key) => `https://app.test/media/${key}`,
			...unusedTrackerDeps(),
		});

		const response = await catalog.search("Example");

		expect(response).toEqual({
			totalResults: 2,
			results: [
				{
					...hit({ torrentId: "1" }),
					imageUrl: "https://app.test/media/covers/1.webp",
				},
				{
					...hit({ torrentId: "2", title: "No Cover" }),
					imageUrl: null,
				},
			],
		});
	});
});

describe("catalog.searchRefresh", () => {
	test("upserts, enriches covers, enqueues only missing covers", async () => {
		const upserted: string[] = [];
		const enqueued: string[][] = [];

		const catalog = createCatalog({
			normalizeTitle: (q) => q,
			searchLocal: async () => {
				throw new Error("local search should not run for refresh");
			},
			searchTracker: async () => ({
				status: "ok",
				totalResults: 2,
				results: [
					hit({ torrentId: "10" }),
					hit({ torrentId: "11", title: "Needs Cover" }),
				],
			}),
			upsertFromTracker: async (results) => {
				upserted.push(...results.map((r) => r.torrentId));
			},
			loadImageKeys: async () =>
				new Map<string, string | null>([
					["10", "covers/10.webp"],
					["11", null],
				]),
			publicUrl: (key) => `https://app.test/media/${key}`,
			enqueueCoverFetch: (ids) => {
				enqueued.push(ids);
			},
		});

		const response = await catalog.searchRefresh("film", {});

		expect(upserted).toEqual(["10", "11"]);
		expect(enqueued).toEqual([["11"]]);
		expect(response).toEqual({
			totalResults: 2,
			results: [
				{
					...hit({ torrentId: "10" }),
					imageUrl: "https://app.test/media/covers/10.webp",
				},
				{
					...hit({ torrentId: "11", title: "Needs Cover" }),
					imageUrl: null,
				},
			],
		});
	});

	test("throws when tracker is unavailable", async () => {
		const catalog = createCatalog({
			normalizeTitle: (q) => q,
			searchLocal: async () => [],
			searchTracker: async () => ({ status: "unavailable" }),
			upsertFromTracker: async () => {
				throw new Error("should not upsert when unavailable");
			},
			loadImageKeys: async () => new Map(),
			publicUrl: (key) => key,
			enqueueCoverFetch: () => {
				throw new Error("should not enqueue when unavailable");
			},
		});

		await expect(catalog.searchRefresh("film", {})).rejects.toThrow(
			/tracker/i,
		);
	});

	test("throws when tracker returns error", async () => {
		const catalog = createCatalog({
			normalizeTitle: (q) => q,
			searchLocal: async () => [],
			searchTracker: async () => ({
				status: "error",
				error: new Error("timeout"),
			}),
			upsertFromTracker: async () => {
				throw new Error("should not upsert on error");
			},
			loadImageKeys: async () => new Map(),
			publicUrl: (key) => key,
			enqueueCoverFetch: () => {
				throw new Error("should not enqueue on error");
			},
		});

		await expect(catalog.searchRefresh("film", {})).rejects.toThrow("timeout");
	});
});
