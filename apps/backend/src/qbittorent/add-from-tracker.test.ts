import { describe, expect, test } from "bun:test";
import {
	AddFromTrackerGatewayError,
	AddFromTrackerPreconditionError,
	createAddFromTracker,
	isAllowedRutrackerTorrentUrl,
} from "./add-from-tracker";

describe("isAllowedRutrackerTorrentUrl", () => {
	test("accepts https RuTracker dl.php with numeric topic id", () => {
		expect(
			isAllowedRutrackerTorrentUrl(
				"https://rutracker.org/forum/dl.php?t=12345",
			),
		).toBe(true);
	});

	test("rejects non-RuTracker hosts and odd paths", () => {
		expect(
			isAllowedRutrackerTorrentUrl("https://evil.example/forum/dl.php?t=1"),
		).toBe(false);
		expect(
			isAllowedRutrackerTorrentUrl("http://rutracker.org/forum/dl.php?t=1"),
		).toBe(false);
		expect(
			isAllowedRutrackerTorrentUrl(
				"https://rutracker.org/forum/viewtopic.php?t=1",
			),
		).toBe(false);
	});
});

describe("addFromTracker", () => {
	test("rejects disallowed torrent URLs before calling adapters", async () => {
		const addFromTracker = createAddFromTracker({
			loadConfig: async () => {
				throw new Error("should not load config");
			},
			fetchTorrentFile: async () => {
				throw new Error("should not fetch");
			},
			addTorrent: async () => {
				throw new Error("should not add");
			},
		});

		await expect(
			addFromTracker("https://evil.example/x", "films"),
		).rejects.toBeInstanceOf(AddFromTrackerPreconditionError);
	});

	test("downloads from tracker and adds to qBittorrent with films path", async () => {
		const calls: string[] = [];
		const bytes = new Uint8Array([1, 2, 3]);
		const addFromTracker = createAddFromTracker({
			loadConfig: async () => ({
				filmsPath: "/data/films",
				seriesPath: "/data/tv",
			}),
			fetchTorrentFile: async (url) => {
				calls.push(`fetch:${url}`);
				return bytes;
			},
			addTorrent: async (file, options) => {
				calls.push(`add:${options.pathToSave}:${file.length}`);
			},
		});

		await addFromTracker(
			"https://rutracker.org/forum/dl.php?t=99",
			"films",
		);

		expect(calls).toEqual([
			"fetch:https://rutracker.org/forum/dl.php?t=99",
			"add:/data/films:3",
		]);
	});

	test("maps tracker fetch failures to gateway errors", async () => {
		const addFromTracker = createAddFromTracker({
			loadConfig: async () => ({
				filmsPath: "/data/films",
				seriesPath: "/data/tv",
			}),
			fetchTorrentFile: async () => {
				throw new AddFromTrackerGatewayError("tracker down");
			},
			addTorrent: async () => {
				throw new Error("should not add");
			},
		});

		await expect(
			addFromTracker("https://rutracker.org/forum/dl.php?t=1", "tv"),
		).rejects.toBeInstanceOf(AddFromTrackerGatewayError);
	});
});
