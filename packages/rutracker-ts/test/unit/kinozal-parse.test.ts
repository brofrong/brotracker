import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import iconv from "iconv-lite";
import {
	formatDate,
	formatSize,
} from "../../src/tracker/search-engine/kinozal/format";
import { parseResponse } from "../../src/tracker/search-engine/kinozal/parse";
import type { SearchResult } from "../../src/tracker/tracker-interface";

const htmlDir = join(import.meta.dir, "../fixtures/html/kinozal");

async function loadFixture(name: string) {
	const bytes = await Bun.file(join(htmlDir, name)).arrayBuffer();
	return iconv.decode(Buffer.from(bytes), "windows-1251");
}

function expectValidResult(result: SearchResult) {
	expect(result.torrentId).toMatch(/^kinozal:\d+$/);
	expect(result.forumId).toMatch(/^\d+$/);
	expect(result.category.length).toBeGreaterThan(0);
	expect(result.title.length).toBeGreaterThan(0);
	expect(result.authorId).toMatch(/^\d+$/);
	expect(result.size).toBeGreaterThan(0);
	expect(result.torrentFileUrl).toMatch(
		/^https:\/\/dl\.kinozal\.me\/download\.php\?id=\d+$/,
	);
	expect(result.topicUrl).toMatch(
		/^https:\/\/kinozal\.me\/details\.php\?id=\d+$/,
	);
	expect(Number.isFinite(result.seeds)).toBe(true);
	expect(Number.isFinite(result.leeches)).toBe(true);
	expect(result.date).toBeInstanceOf(Date);
	expect(Number.isNaN(result.date.getTime())).toBe(false);
	expect(["HDR", "SDR", null]).toContain(result.hdr);
	expect(["4K", "1080p", "720p", "SD", null]).toContain(result.resolution);
}

describe("kinozal format", () => {
	test("parse size with Russian units", () => {
		expect(formatSize("40.61 ГБ")).toBeCloseTo(40.61 * 1024 ** 3, 0);
		expect(formatSize("300 МБ")).toBeCloseTo(300 * 1024 ** 2, 0);
	});

	test("parse absolute and relative dates", () => {
		const absolute = formatDate("29.07.2026 в 18:41");
		expect(absolute.getFullYear()).toBe(2026);
		expect(absolute.getMonth()).toBe(6);
		expect(absolute.getDate()).toBe(29);
		expect(absolute.getHours()).toBe(18);
		expect(absolute.getMinutes()).toBe(41);

		const today = formatDate("сегодня в 12:30", new Date(2026, 6, 29, 8, 0));
		expect(today.getFullYear()).toBe(2026);
		expect(today.getMonth()).toBe(6);
		expect(today.getDate()).toBe(29);
		expect(today.getHours()).toBe(12);
		expect(today.getMinutes()).toBe(30);
	});
});

describe("kinozal parseResponse", () => {
	test("parses browse-matrix fixture", async () => {
		const html = await loadFixture("browse-matrix.html");
		const page = parseResponse(html);

		expect(page.isOk()).toBe(true);
		if (!page.isOk()) return;

		expect(page.value.totalResults).toBe(160);
		expect(page.value.results.length).toBeGreaterThan(0);

		const first = page.value.results[0];
		if (!first) throw new Error("No results");

		expectValidResult(first);
		expect(first.torrentId).toBe("kinozal:2095995");
		expect(first.forumId).toBe("13");
		expect(first.title).toContain("Матрица: Перезагрузка");
		expect(first.authorId).toBe("3094327");
		expect(first.size).toBeCloseTo(40.61 * 1024 ** 3, 0);
		expect(first.seeds).toBe(3);
		expect(first.leeches).toBe(0);
		expect(first.torrentFileUrl).toBe(
			"https://dl.kinozal.me/download.php?id=2095995",
		);
		expect(first.topicUrl).toBe(
			"https://kinozal.me/details.php?id=2095995",
		);
		expect(first.resolution).toBe("1080p");

		const hdrTitle = page.value.results.find((r) =>
			r.title.includes("HDR / WEB-DL (2160p)"),
		);
		expect(hdrTitle?.resolution).toBe("4K");
	});
});
