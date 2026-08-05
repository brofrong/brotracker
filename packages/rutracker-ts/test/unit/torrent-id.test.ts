import { describe, expect, test } from "bun:test";
import {
	formatTorrentId,
	parseTorrentId,
} from "../../src/tracker/torrent-id";

describe("formatTorrentId", () => {
	test("namespaces raw id", () => {
		expect(formatTorrentId("rutracker", "123")).toBe("rutracker:123");
		expect(formatTorrentId("kinozal", "2095995")).toBe("kinozal:2095995");
	});

	test("rejects empty or already namespaced raw id", () => {
		expect(() => formatTorrentId("rutracker", "")).toThrow();
		expect(() => formatTorrentId("rutracker", "rutracker:1")).toThrow();
	});
});

describe("parseTorrentId", () => {
	test("parses namespaced ids", () => {
		expect(parseTorrentId("rutracker:6847857")).toEqual({
			source: "rutracker",
			rawId: "6847857",
		});
		expect(parseTorrentId("kinozal:2095995")).toEqual({
			source: "kinozal",
			rawId: "2095995",
		});
	});

	test("treats bare digits as legacy rutracker", () => {
		expect(parseTorrentId("6847857")).toEqual({
			source: "rutracker",
			rawId: "6847857",
		});
	});

	test("rejects unknown source or empty raw", () => {
		expect(() => parseTorrentId("other:1")).toThrow();
		expect(() => parseTorrentId("rutracker:")).toThrow();
		expect(() => parseTorrentId("abc")).toThrow();
	});
});
