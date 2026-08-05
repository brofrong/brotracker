import { describe, expect, test } from "bun:test";
import {
	type CheckResult,
	checkTopicNow,
	type RecordWatchEventInput,
	type TitleWatchRecord,
} from "./check-topic-now";

function watch(partial: Partial<TitleWatchRecord> = {}): TitleWatchRecord {
	return {
		topicUrl: "https://rutracker.org/forum/viewtopic.php?t=55",
		titleId: "tmdb:tv:1",
		watch: "tracking",
		source: "manual",
		size: 100,
		registeredAt: "2024-01-01T00:00:00.000Z",
		contentHash: "oldhash",
		qbHash: "qb1",
		lastCheckedAt: null,
		lastChangedAt: null,
		lastError: null,
		...partial,
	};
}

describe("checkTopicNow", () => {
	test("returns unchanged when fingerprint matches and does not replace", async () => {
		const bytes = new Uint8Array([1, 2, 3, 4]);
		const contentHash =
			"9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a";
		const saved: TitleWatchRecord[] = [];
		const replaceCalls: string[] = [];

		const result = await checkTopicNow(
			{ topicUrl: watch().topicUrl },
			{
				loadWatch: async () => watch({ contentHash, size: 4 }),
				saveWatch: async (record) => {
					saved.push(record);
				},
				fetchTorrentBytes: async () => bytes,
				fetchTopicMeta: async () => ({
					size: 4,
					registeredAt: "2024-01-01T00:00:00.000Z",
					torrentFileUrl: "https://rutracker.org/forum/dl.php?t=55",
				}),
				replaceInQb: async () => {
					replaceCalls.push("replace");
				},
				now: () => "2026-08-02T10:00:00.000Z",
			},
		);

		expect(result).toEqual({
			status: "unchanged",
			checkedAt: "2026-08-02T10:00:00.000Z",
		} satisfies CheckResult);
		expect(replaceCalls).toEqual([]);
		expect(saved[0]?.lastCheckedAt).toBe("2026-08-02T10:00:00.000Z");
		expect(saved[0]?.lastError).toBeNull();
	});

	test("replaces in qB and returns updated when content hash changed", async () => {
		const bytes = new Uint8Array([1, 2, 3, 4]);
		const saved: TitleWatchRecord[] = [];
		const replaceCalls: string[] = [];

		const result = await checkTopicNow(
			{ topicUrl: watch().topicUrl },
			{
				loadWatch: async () => watch({ contentHash: "different", size: 99 }),
				saveWatch: async (record) => {
					saved.push(record);
				},
				fetchTorrentBytes: async () => bytes,
				fetchTopicMeta: async () => ({
					size: 4,
					registeredAt: "2025-01-01T00:00:00.000Z",
					torrentFileUrl: "https://rutracker.org/forum/dl.php?t=55",
				}),
				replaceInQb: async ({ topicId }) => {
					replaceCalls.push(topicId);
				},
				now: () => "2026-08-02T11:00:00.000Z",
			},
		);

		expect(result).toEqual({
			status: "updated",
			checkedAt: "2026-08-02T11:00:00.000Z",
			previousSize: 99,
			newSize: 4,
			applied: true,
		});
		expect(replaceCalls).toEqual(["rutracker:55"]);
		expect(saved[0]?.contentHash).toBe(
			"9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a",
		);
		expect(saved[0]?.lastChangedAt).toBe("2026-08-02T11:00:00.000Z");
		expect(saved[0]?.lastError).toBeNull();
	});

	test("returns failed without throwing when tracker fetch fails", async () => {
		const saved: TitleWatchRecord[] = [];
		const result = await checkTopicNow(
			{ topicUrl: watch().topicUrl },
			{
				loadWatch: async () => watch(),
				saveWatch: async (record) => {
					saved.push(record);
				},
				fetchTorrentBytes: async () => {
					throw new Error("tracker down");
				},
				fetchTopicMeta: async () => ({
					size: 1,
					registeredAt: null,
					torrentFileUrl: "https://rutracker.org/forum/dl.php?t=55",
				}),
				replaceInQb: async () => {
					throw new Error("should not replace");
				},
				now: () => "2026-08-02T12:00:00.000Z",
			},
		);

		expect(result).toEqual({
			status: "failed",
			checkedAt: "2026-08-02T12:00:00.000Z",
			message: "tracker down",
		});
		expect(saved[0]?.lastError).toBe("tracker down");
	});

	test("bootstraps fingerprint without replace when no content hash yet", async () => {
		const bytes = new Uint8Array([1, 2, 3, 4]);
		const saved: TitleWatchRecord[] = [];
		const replaceCalls: string[] = [];

		const result = await checkTopicNow(
			{ topicUrl: watch().topicUrl },
			{
				loadWatch: async () => watch({ contentHash: null, size: 100 }),
				saveWatch: async (record) => {
					saved.push(record);
				},
				fetchTorrentBytes: async () => bytes,
				fetchTopicMeta: async () => ({
					size: 4,
					registeredAt: "2024-01-01T00:00:00.000Z",
					torrentFileUrl: "https://rutracker.org/forum/dl.php?t=55",
				}),
				replaceInQb: async () => {
					replaceCalls.push("replace");
				},
				now: () => "2026-08-02T15:00:00.000Z",
			},
		);

		expect(result.status).toBe("unchanged");
		expect(replaceCalls).toEqual([]);
		expect(saved[0]?.contentHash).toBe(
			"9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a",
		);
	});

	test("records a torrent-updated event when the replace is applied", async () => {
		const bytes = new Uint8Array([1, 2, 3, 4]);
		const events: RecordWatchEventInput[] = [];

		const result = await checkTopicNow(
			{ topicUrl: watch().topicUrl },
			{
				loadWatch: async () =>
					watch({ contentHash: "different", size: 99, titleId: "tmdb:tv:1" }),
				saveWatch: async () => {},
				fetchTorrentBytes: async () => bytes,
				fetchTopicMeta: async () => ({
					size: 4,
					registeredAt: "2025-01-01T00:00:00.000Z",
					torrentFileUrl: "https://rutracker.org/forum/dl.php?t=55",
				}),
				replaceInQb: async () => {},
				now: () => "2026-08-02T11:00:00.000Z",
				recordEvent: async (event) => {
					events.push(event);
				},
			},
		);

		expect(result.status).toBe("updated");
		expect(events).toEqual([
			{
				titleId: "tmdb:tv:1",
				topicUrl: watch().topicUrl,
				kind: "torrent-updated",
				message: null,
				previousSize: 99,
				newSize: 4,
			},
		]);
	});

	test("records a check-failed event with the error message when the check throws", async () => {
		const events: RecordWatchEventInput[] = [];

		const result = await checkTopicNow(
			{ topicUrl: watch().topicUrl },
			{
				loadWatch: async () => watch({ titleId: "tmdb:tv:1" }),
				saveWatch: async () => {},
				fetchTorrentBytes: async () => {
					throw new Error("tracker down");
				},
				fetchTopicMeta: async () => ({
					size: 1,
					registeredAt: null,
					torrentFileUrl: "https://rutracker.org/forum/dl.php?t=55",
				}),
				replaceInQb: async () => {},
				now: () => "2026-08-02T12:00:00.000Z",
				recordEvent: async (event) => {
					events.push(event);
				},
			},
		);

		expect(result.status).toBe("failed");
		expect(events).toEqual([
			{
				titleId: "tmdb:tv:1",
				topicUrl: watch().topicUrl,
				kind: "check-failed",
				message: "tracker down",
			},
		]);
	});

	test("does not record an event when unchanged", async () => {
		const events: RecordWatchEventInput[] = [];
		const contentHash =
			"9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a";

		await checkTopicNow(
			{ topicUrl: watch().topicUrl },
			{
				loadWatch: async () => watch({ contentHash, size: 4 }),
				saveWatch: async () => {},
				fetchTorrentBytes: async () => new Uint8Array([1, 2, 3, 4]),
				fetchTopicMeta: async () => ({
					size: 4,
					registeredAt: "2024-01-01T00:00:00.000Z",
					torrentFileUrl: "https://rutracker.org/forum/dl.php?t=55",
				}),
				replaceInQb: async () => {
					throw new Error("should not replace");
				},
				now: () => "2026-08-02T10:00:00.000Z",
				recordEvent: async (event) => {
					events.push(event);
				},
			},
		);

		expect(events).toEqual([]);
	});

	test("swallows recordEvent failures without affecting the check result", async () => {
		const result = await checkTopicNow(
			{ topicUrl: watch().topicUrl },
			{
				loadWatch: async () => watch({ contentHash: "different", size: 99 }),
				saveWatch: async () => {},
				fetchTorrentBytes: async () => new Uint8Array([1, 2, 3, 4]),
				fetchTopicMeta: async () => ({
					size: 4,
					registeredAt: "2025-01-01T00:00:00.000Z",
					torrentFileUrl: "https://rutracker.org/forum/dl.php?t=55",
				}),
				replaceInQb: async () => {},
				now: () => "2026-08-02T11:00:00.000Z",
				recordEvent: async () => {
					throw new Error("feed store down");
				},
			},
		);

		expect(result.status).toBe("updated");
	});
});
