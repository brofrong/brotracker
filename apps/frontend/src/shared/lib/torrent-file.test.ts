import { describe, expect, test } from "vitest";

import { base64ToBytes, torrentFileName } from "./torrent-file";

describe("torrentFileName", () => {
	test("keeps a plain title and adds the extension", () => {
		expect(torrentFileName("Дюна (2021) WEB-DL 2160p")).toBe(
			"Дюна (2021) WEB-DL 2160p.torrent",
		);
	});

	test("turns title separators into dashes and drops forbidden characters", () => {
		expect(torrentFileName('Дюна / Dune: Part Two | "HDR" <4K>?')).toBe(
			"Дюна - Dune Part Two - HDR 4K.torrent",
		);
	});

	test("trims trailing dots and collapses whitespace", () => {
		expect(torrentFileName("  Film   name ...  ")).toBe("Film name.torrent");
	});

	test("caps very long names", () => {
		const name = torrentFileName("a".repeat(500));
		expect(name).toBe(`${"a".repeat(180)}.torrent`);
	});

	test("falls back when nothing usable is left", () => {
		expect(torrentFileName('  ?*"  ')).toBe("torrent.torrent");
	});
});

describe("base64ToBytes", () => {
	test("decodes binary bytes", () => {
		expect(Array.from(base64ToBytes("ZDg6AP8="))).toEqual([
			100, 56, 58, 0, 255,
		]);
	});
});

describe("torrentFileName control characters", () => {
	test("drops control characters", () => {
		expect(torrentFileName("Film\u0000\u001f\tname")).toBe("Filmname.torrent");
	});
});
