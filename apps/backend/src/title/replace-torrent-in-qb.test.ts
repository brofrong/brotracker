import { describe, expect, test } from "bun:test";
import {
	createReplaceTorrentInQb,
	ReplaceTorrentError,
} from "./replace-torrent-in-qb";

describe("replaceTorrentInQb", () => {
	test("deletes existing tagged torrent without files then adds new bytes with same path and tags", async () => {
		const calls: string[] = [];
		const bytes = new Uint8Array([9, 9, 9]);
		const replace = createReplaceTorrentInQb({
			listTorrents: async () => [
				{
					hash: "oldhash",
					savePath: "/data/tv",
					tags: "foo, brotracker:topic:55, bar",
				},
			],
			deleteTorrent: async (hash, options) => {
				calls.push(`delete:${hash}:${options.deleteFiles}`);
			},
			addTorrent: async (file, options) => {
				calls.push(
					`add:${options.pathToSave}:${file.length}:${(options.tags ?? []).join("|")}`,
				);
			},
			getSeriesPath: async () => "/data/tv",
		});

		await replace({
			topicId: "55",
			torrentBytes: bytes,
			tags: ["brotracker:topic:55"],
		});

		expect(calls).toEqual([
			"delete:oldhash:false",
			"add:/data/tv:3:brotracker:topic:55",
		]);
	});

	test("adds when no existing torrent matches the topic tag", async () => {
		const calls: string[] = [];
		const replace = createReplaceTorrentInQb({
			listTorrents: async () => [],
			deleteTorrent: async () => {
				calls.push("delete");
			},
			addTorrent: async (_file, options) => {
				calls.push(`add:${options.pathToSave}`);
			},
			getSeriesPath: async () => "/data/series",
		});

		await replace({
			topicId: "1",
			torrentBytes: new Uint8Array([1]),
			tags: ["brotracker:topic:1"],
		});

		expect(calls).toEqual(["add:/data/series"]);
	});

	test("fails when series path is not configured", async () => {
		const replace = createReplaceTorrentInQb({
			listTorrents: async () => [],
			deleteTorrent: async () => {},
			addTorrent: async () => {},
			getSeriesPath: async () => null,
		});

		await expect(
			replace({
				topicId: "1",
				torrentBytes: new Uint8Array([1]),
				tags: ["brotracker:topic:1"],
			}),
		).rejects.toBeInstanceOf(ReplaceTorrentError);
	});
});
