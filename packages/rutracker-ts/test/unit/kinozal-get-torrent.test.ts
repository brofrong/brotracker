import { describe, expect, test } from "bun:test";
import { err } from "neverthrow";
import { kinozalGetTorrent } from "../../src/tracker/search-engine/kinozal/get-torrent";
import { KINOZAL_MIRRORS } from "../../src/tracker/search-engine/kinozal/constants";
import type { KinozalOptions } from "../../src/tracker/tracker-interface";

function optionsThatNeverLeaveTheMachine(): KinozalOptions {
	return {
		auth: { login: "x", password: "y" },
		proxyAgent: null,
		fileStore: {
			path: "memory",
			read: async () => err(new Error("store unavailable")),
			write: async () => err(new Error("store unavailable")),
			update: async () => err(new Error("store unavailable")),
			getCookieHeader: async () => err(new Error("store unavailable")),
		},
	};
}

describe("kinozalGetTorrent allowlist", () => {
	test("accepts download URLs from every official Kinozal mirror", async () => {
		for (const mirror of KINOZAL_MIRRORS) {
			const result = await kinozalGetTorrent(
				`${mirror.dlUrl}/download.php?id=2021740`,
				optionsThatNeverLeaveTheMachine(),
			);
			expect(result.isErr()).toBe(true);
			if (result.isErr()) {
				expect(result.error.message).not.toContain("not allowlisted");
			}
		}
	});

	test("rejects torrent URLs that are not Kinozal download endpoints", async () => {
		const result = await kinozalGetTorrent(
			"https://evil.example/download.php?id=1",
			optionsThatNeverLeaveTheMachine(),
		);
		expect(result.isErr()).toBe(true);
		if (result.isErr()) {
			expect(result.error.message).toContain("not allowlisted");
		}
	});
});
