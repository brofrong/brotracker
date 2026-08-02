import { describe, expect, test } from "bun:test";
import {
	fingerprintsEqual,
	hashTorrentBytes,
	type TorrentFingerprint,
} from "./torrent-fingerprint";

describe("fingerprintsEqual", () => {
	test("prefers content hash when both sides have it", () => {
		const left: TorrentFingerprint = {
			size: 100,
			registeredAt: "2024-01-01T00:00:00.000Z",
			contentHash: "aaa",
		};
		const right: TorrentFingerprint = {
			size: 999,
			registeredAt: "2099-01-01T00:00:00.000Z",
			contentHash: "aaa",
		};
		expect(fingerprintsEqual(left, right)).toBe(true);
	});

	test("different content hashes mean changed even if size matches", () => {
		expect(
			fingerprintsEqual(
				{ size: 100, registeredAt: null, contentHash: "aaa" },
				{ size: 100, registeredAt: null, contentHash: "bbb" },
			),
		).toBe(false);
	});

	test("falls back to size + registeredAt when hash missing", () => {
		expect(
			fingerprintsEqual(
				{ size: 42, registeredAt: "2024-06-01T12:00:00.000Z", contentHash: null },
				{ size: 42, registeredAt: "2024-06-01T12:00:00.000Z", contentHash: null },
			),
		).toBe(true);
		expect(
			fingerprintsEqual(
				{ size: 42, registeredAt: "2024-06-01T12:00:00.000Z", contentHash: null },
				{ size: 43, registeredAt: "2024-06-01T12:00:00.000Z", contentHash: null },
			),
		).toBe(false);
	});
});

describe("hashTorrentBytes", () => {
	test("hashes torrent file bytes stably", async () => {
		const bytes = new Uint8Array([1, 2, 3, 4]);
		const first = await hashTorrentBytes(bytes);
		const second = await hashTorrentBytes(bytes);
		expect(first).toBe(second);
		expect(first).toBe(
			"9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a",
		);
	});
});
