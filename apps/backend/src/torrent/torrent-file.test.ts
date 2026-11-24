import { describe, expect, test } from "bun:test";

import type { TrackerInterface } from "@brotracker/rutracker-ts/tracker/tracker-interface";
import { err, ok } from "neverthrow";

import {
	createTorrentFileFetcher,
	TorrentFileGatewayError,
	TorrentFilePreconditionError,
} from "./torrent-file";

const URL_OK = "https://rutracker.org/forum/dl.php?t=12345";

function trackerReturning(
	result: Awaited<ReturnType<TrackerInterface["getTorrent"]>>,
): TrackerInterface {
	return {
		getTorrent: async () => result,
	} as unknown as TrackerInterface;
}

describe("createTorrentFileFetcher", () => {
	test("returns the tracker's bytes for an allowed URL", async () => {
		const bytes = new Uint8Array([100, 56, 58]);
		const requested: string[] = [];
		const fetchTorrentFile = createTorrentFileFetcher({
			trackerForUrl: async (url) => {
				requested.push(url);
				return trackerReturning(ok(bytes));
			},
		});

		expect(await fetchTorrentFile(URL_OK)).toEqual(bytes);
		expect(requested).toEqual([URL_OK]);
	});

	test("rejects URLs outside the tracker allowlist without asking a tracker", async () => {
		let asked = false;
		const fetchTorrentFile = createTorrentFileFetcher({
			trackerForUrl: async () => {
				asked = true;
				return trackerReturning(ok(new Uint8Array()));
			},
		});

		await expect(
			fetchTorrentFile("https://evil.example/forum/dl.php?t=1"),
		).rejects.toBeInstanceOf(TorrentFilePreconditionError);
		expect(asked).toBe(false);
	});

	test("an unconfigured tracker is a precondition error", async () => {
		const fetchTorrentFile = createTorrentFileFetcher({
			trackerForUrl: async () => {
				throw new Error("RuTracker is not configured.");
			},
		});

		const error = await fetchTorrentFile(URL_OK).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(TorrentFilePreconditionError);
		expect((error as Error).message).toBe("RuTracker is not configured.");
	});

	test("a tracker failure is a gateway error", async () => {
		const fetchTorrentFile = createTorrentFileFetcher({
			trackerForUrl: async () =>
				trackerReturning(err(new Error("Cloudflare challenge failed"))),
		});

		const error = await fetchTorrentFile(URL_OK).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(TorrentFileGatewayError);
		expect((error as Error).message).toBe("Cloudflare challenge failed");
	});
});
