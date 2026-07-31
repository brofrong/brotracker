import { expect, test } from "bun:test";
import { isTorrentPayload } from "../../src/tracker/search-engine/rutracker/get-torrent";

test("isTorrentPayload: starts with d → true", () => {
	expect(isTorrentPayload(new Uint8Array([0x64, 0x38]))).toBe(true);
});

test("isTorrentPayload: empty → false", () => {
	expect(isTorrentPayload(new Uint8Array([]))).toBe(false);
});

test("isTorrentPayload: starts with other byte → false", () => {
	expect(isTorrentPayload(new Uint8Array([0x78, 0x65]))).toBe(false);
});
