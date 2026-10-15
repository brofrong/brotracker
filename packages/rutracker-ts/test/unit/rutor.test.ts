import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { join } from "node:path";
import axios from "axios";
import { detectTorrentMediaType } from "../../src/tracker/media-type";
import {
	formatDate,
	formatSize,
} from "../../src/tracker/search-engine/rutor/format";
import { parseImageUrl } from "../../src/tracker/search-engine/rutor/get-image";
import { rutorGetTorrent } from "../../src/tracker/search-engine/rutor/get-torrent";
import {
	isRutorDownloadUrl,
	rutorTopicId,
} from "../../src/tracker/search-engine/rutor/hosts";
import { parseResponse } from "../../src/tracker/search-engine/rutor/parse";
import { rutorSearch } from "../../src/tracker/search-engine/rutor/search";
import { rutorSearchUrl } from "../../src/tracker/search-engine/rutor/search-url";

const htmlDir = join(import.meta.dir, "../fixtures/html/rutor");
const fixture = (name: string) => Bun.file(join(htmlDir, name)).text();

afterEach(() => {
	(axios.get as unknown as { mockRestore?: () => void }).mockRestore?.();
});

describe("rutor parseResponse", () => {
	test("parses rows with and without a comments column", async () => {
		const page = parseResponse(
			await fixture("search.html"),
			"4",
		)._unsafeUnwrap();

		expect(page.totalResults).toBe(135);
		expect(page.results.length).toBe(100);
		const [first, second] = page.results;
		expect(first).toMatchObject({
			torrentId: "rutor:1109831",
			forumId: "4",
			category: "4",
			title:
				"Джентльмены / The Gentlemen [S01-02] (2024-2026) WEB-DLRip-AVC | D, P, P2 | Movie Dubbing, LostFilm, Кубик в Кубе",
			seeds: 11,
			leeches: 38,
			torrentFileUrl: "https://d.rutor.info/download/1109831",
			topicUrl:
				"https://rutor.info/torrent/1109831/dzhentlmeny_the-gentlemen-s01-02-2024-2026-web-dlrip-avc-d-p-p2-movie-dubbing-lostfilm-kubik-v-kube",
		});
		expect(first?.size).toBeCloseTo(10.13 * 1024 ** 3);
		expect(first?.date).toEqual(new Date(2026, 9, 15));
		expect(second).toMatchObject({
			torrentId: "rutor:987011",
			seeds: 100,
			leeches: 61,
			resolution: "1080p",
		});
		expect(second?.size).toBeCloseTo(31.02 * 1024 ** 3);
	});

	test("returns no rows for an empty search", async () => {
		const page = parseResponse(
			await fixture("search-empty.html"),
		)._unsafeUnwrap();
		expect(page).toEqual({ results: [], totalResults: 0 });
	});
});

describe("rutor format", () => {
	test("sizes and dates with non-breaking spaces", () => {
		expect(formatSize("700.5 MB")).toBeCloseTo(700.5 * 1024 ** 2);
		expect(formatSize("1.2 TB")).toBeCloseTo(1.2 * 1024 ** 4);
		expect(formatDate("01 Янв 25")).toEqual(new Date(2025, 0, 1));
		expect(Number.isNaN(formatDate("вчера").getTime())).toBe(true);
	});
});

describe("rutor urls", () => {
	test("builds search urls with category and sort", () => {
		expect(rutorSearchUrl("Матрица 1999", 1, {})).toBe(
			"https://rutor.info/search/0/1/100/2/%D0%9C%D0%B0%D1%82%D1%80%D0%B8%D1%86%D0%B0%201999",
		);
		expect(
			rutorSearchUrl("x", 4, {
				sortType: "registrationDate",
				sortOrder: "ascending",
			}),
		).toBe("https://rutor.info/search/0/4/100/1/x");
	});

	test("recognises download and topic urls", () => {
		expect(isRutorDownloadUrl("https://d.rutor.info/download/123")).toBe(true);
		expect(isRutorDownloadUrl("https://d.rutor.info/download/123/x")).toBe(
			false,
		);
		expect(isRutorDownloadUrl("http://d.rutor.info/download/123")).toBe(false);
		expect(isRutorDownloadUrl("https://evil.test/download/123")).toBe(false);
		expect(rutorTopicId("https://rutor.info/torrent/987011/slug")).toBe(
			"987011",
		);
		expect(rutorTopicId("https://rutor.is/torrent/5")).toBe("5");
		expect(rutorTopicId("https://rutor.info/browse/5")).toBeNull();
	});
});

describe("rutor parseImageUrl", () => {
	test("picks the poster, not rating badges or thumbnails", async () => {
		expect(parseImageUrl(await fixture("topic.html"))._unsafeUnwrap()).toBe(
			"https://i128.fastpic.org/big/2026/1013/e6/e9552efa85e6fa663a8bab1fb185c0e6.jpeg",
		);
	});
});

describe("rutorSearch", () => {
	test("searches each category, tags and de-duplicates rows", async () => {
		const html = await fixture("search.html");
		const urls: string[] = [];
		spyOn(axios, "get").mockImplementation((async (url: string) => {
			urls.push(url);
			return { status: 200, headers: {}, data: html };
		}) as never);

		const page = (
			await rutorSearch("Джентльмены", { category: "tv" }, { proxyAgent: null })
		)._unsafeUnwrap();

		expect(urls.map((url) => url.split("/")[5])).toEqual(["4", "16", "6"]);
		expect(page.results.length).toBe(100);
		expect(page.results[0]?.forumId).toBe("4");
	});

	test("fails only when every category request fails", async () => {
		spyOn(axios, "get").mockImplementation((async () => ({
			status: 503,
			headers: {},
			data: "",
		})) as never);

		const result = await rutorSearch(
			"x",
			{ category: "films" },
			{ proxyAgent: null },
		);
		expect(result._unsafeUnwrapErr().message).toContain("HTTP 503");
	});
});

describe("rutorGetTorrent", () => {
	test("downloads a torrent and rejects other hosts", async () => {
		spyOn(axios, "get").mockImplementation((async () => ({
			status: 200,
			headers: {},
			data: new TextEncoder().encode("d8:announce0:e").buffer,
		})) as never);

		const ok = await rutorGetTorrent("https://d.rutor.info/download/1", {
			proxyAgent: null,
		});
		expect(ok.isOk()).toBe(true);

		const bad = await rutorGetTorrent("https://evil.test/download/1", {
			proxyAgent: null,
		});
		expect(bad.isErr()).toBe(true);
	});
});

describe("detectTorrentMediaType", () => {
	test("uses each tracker's own categories", () => {
		expect(detectTorrentMediaType("rutor:1", "1")).toBe("films");
		expect(detectTorrentMediaType("rutor:1", "16")).toBe("tv");
		expect(detectTorrentMediaType("rutor:1", "")).toBeNull();
		expect(detectTorrentMediaType("kinozal:1", "45")).toBe("tv");
		expect(detectTorrentMediaType("bad id", "1")).toBeNull();
	});
});
