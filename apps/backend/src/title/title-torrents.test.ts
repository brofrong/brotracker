import { describe, expect, test } from "bun:test";
import { createTitleModule, type TitleDeps } from "./title";
import type { TitleRating, TitleTorrentCandidate } from "./title.types";
import { topicTag } from "./topic-tag";

const stubRatings = (): TitleRating[] => [
	{ source: "tmdb", status: "unavailable" },
	{ source: "imdb", status: "unconfigured" },
	{ source: "kinopoisk", status: "unconfigured" },
];

const candidate = (
	overrides: Partial<TitleTorrentCandidate> = {},
): TitleTorrentCandidate => ({
	torrentId: "100",
	title: "Inception 2010 1080p",
	size: 8e9,
	seeds: 50,
	leeches: 2,
	torrentFileUrl: "https://rutracker.org/forum/dl.php?t=100",
	topicUrl: "https://rutracker.org/forum/viewtopic.php?t=100",
	hdr: "SDR",
	resolution: "1080p",
	forumId: "2198",
	...overrides,
});

function deps(overrides: Partial<TitleDeps> = {}): TitleDeps {
	return {
		fetchTmdbMeta: async () => ({
			status: "ok",
			meta: {
				kind: "films",
				poster: null,
				name: "Inception",
				year: 2010,
				overview: null,
				genres: [],
				cast: [],
				crew: [],
				runtimeMinutes: 148,
				status: null,
				seasons: null,
				voteAverage: 8,
				voteCount: 1,
			},
		}),
		getRatings: async () => stubRatings(),
		searchLocal: async () => [],
		searchTracker: async () => ({ status: "unavailable" }),
		listTaggedTorrents: async () => [],
		addFromTracker: async () => {},
		...overrides,
	};
}

describe("title.torrents", () => {
	test("returns scored candidates from tracker sorted by quality", async () => {
		const title = createTitleModule(
			deps({
				searchTracker: async (query) => {
					expect(query).toBe("Inception");
					return {
						status: "ok",
						results: [
							candidate({
								torrentId: "1",
								topicUrl: "https://rutracker.org/forum/viewtopic.php?t=1",
								torrentFileUrl: "https://rutracker.org/forum/dl.php?t=1",
								resolution: "720p",
								seeds: 5,
								size: 4e9,
							}),
							candidate({
								torrentId: "2",
								topicUrl: "https://rutracker.org/forum/viewtopic.php?t=2",
								torrentFileUrl: "https://rutracker.org/forum/dl.php?t=2",
								resolution: "4K",
								hdr: "HDR",
								seeds: 20,
								size: 20e9,
							}),
						],
					};
				},
			}),
		);

		const result = await title.torrents({ id: "tmdb:films:27205" });

		expect(result.status).toBe("ok");
		expect(result.items).toHaveLength(2);
		expect(result.items[0]?.torrentId).toBe("2");
		expect(result.items[0]?.badges).toEqual(["4K", "HDR"]);
		expect(result.items[0]?.qualityScore).toBeGreaterThan(
			result.items[1]?.qualityScore ?? 0,
		);
		expect(result.items[0]?.transfer).toBeNull();
	});

	test("attaches transfer when topic tag matches a live torrent", async () => {
		const title = createTitleModule(
			deps({
				searchTracker: async () => ({
					status: "ok",
					results: [candidate()],
				}),
				listTaggedTorrents: async () => [
					{
						hash: "deadbeef",
						progress: 0.65,
						stateKind: "downloading",
						stateLabel: "Загрузка",
						downloadSpeed: 2_000_000,
						etaSeconds: 600,
						tags: topicTag("100"),
					},
				],
			}),
		);

		const result = await title.torrents({ id: "tmdb:films:1" });

		expect(result.items[0]?.transfer).toEqual({
			hash: "deadbeef",
			progress: 0.65,
			stateKind: "downloading",
			stateLabel: "Загрузка",
			downloadSpeed: 2_000_000,
			etaSeconds: 600,
		});
	});

	test("falls back to local when tracker is unavailable (degraded)", async () => {
		const title = createTitleModule(
			deps({
				searchTracker: async () => ({ status: "unavailable" }),
				searchLocal: async (query) => {
					expect(query).toBe("Inception");
					return [candidate({ torrentId: "9" })];
				},
			}),
		);

		const result = await title.torrents({ id: "tmdb:films:1" });

		expect(result.status).toBe("degraded");
		expect(result.items).toHaveLength(1);
		expect(result.items[0]?.torrentId).toBe("9");
		expect(result.items[0]?.source).toBe("local");
	});

	test("returns empty when title has no searchable name", async () => {
		const title = createTitleModule(
			deps({
				fetchTmdbMeta: async () => ({ status: "unavailable" }),
				searchLocal: async () => {
					throw new Error("should not search without a name");
				},
			}),
		);

		const result = await title.torrents({ id: "tmdb:films:1" });

		expect(result).toEqual({ status: "empty", items: [] });
	});
});

describe("title.add", () => {
	test("adds via injected addFromTracker with topic tag and kind", async () => {
		const calls: Array<{
			torrentFileUrl: string;
			kind: "films" | "tv";
			tags: string[];
		}> = [];

		const title = createTitleModule(
			deps({
				addFromTracker: async (torrentFileUrl, kind, tags) => {
					calls.push({ torrentFileUrl, kind, tags });
				},
			}),
		);

		await expect(
			title.add({
				torrentFileUrl: "https://rutracker.org/forum/dl.php?t=100",
				kind: "films",
				topicUrl: "https://rutracker.org/forum/viewtopic.php?t=100",
			}),
		).resolves.toEqual({ ok: true });

		expect(calls).toEqual([
			{
				torrentFileUrl: "https://rutracker.org/forum/dl.php?t=100",
				kind: "films",
				tags: [topicTag("100")],
			},
		]);
	});

	test("rejects when topic id cannot be extracted", async () => {
		const title = createTitleModule(deps());

		await expect(
			title.add({
				torrentFileUrl: "https://rutracker.org/forum/dl.php?t=100",
				kind: "films",
				topicUrl: "https://example.com/",
			}),
		).rejects.toThrow(/topic/i);
	});
});
