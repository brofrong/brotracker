import { describe, expect, test } from "bun:test";
import {
	createCoverFetchQueue,
	type CoverPipelineDeps,
} from "./cover-pipeline";

function memoryDeps(
	overrides: Partial<CoverPipelineDeps> & {
		keys?: Map<string, string | null>;
	} = {},
): CoverPipelineDeps & {
	persisted: Array<{ torrentId: string; key: string }>;
	downloads: string[];
} {
	const keys = overrides.keys ?? new Map<string, string | null>();
	const persisted: Array<{ torrentId: string; key: string }> = [];
	const downloads: string[] = [];

	return {
		persisted,
		downloads,
		getImageKey: async (torrentId) => {
			if (!keys.has(torrentId)) {
				return undefined;
			}
			return keys.get(torrentId) ?? null;
		},
		resolveImageUrl: async () => "https://img.test/cover.jpg",
		downloadBytes: async (url) => {
			downloads.push(url);
			return new Uint8Array([1, 2, 3]);
		},
		optimize: async (bytes) => new Uint8Array([...bytes, 9]),
		putCover: async (torrentId) => `covers/${torrentId}.webp`,
		persistImageKey: async (torrentId, key) => {
			persisted.push({ torrentId, key });
			keys.set(torrentId, key);
		},
		...overrides,
	};
}

describe("cover fetch pipeline", () => {
	test("stores optimized cover when image key is missing", async () => {
		const deps = memoryDeps({
			keys: new Map([["42", null]]),
		});
		const queue = createCoverFetchQueue(deps);

		queue.enqueue(["42"]);
		await queue.whenIdle();

		expect(deps.downloads).toEqual(["https://img.test/cover.jpg"]);
		expect(deps.persisted).toEqual([
			{ torrentId: "42", key: "covers/42.webp" },
		]);
	});

	test("skips download when cover key is already present", async () => {
		const deps = memoryDeps({
			keys: new Map([["7", "covers/7.webp"]]),
			resolveImageUrl: async () => {
				throw new Error("should not resolve");
			},
			downloadBytes: async () => {
				throw new Error("should not download");
			},
		});
		const queue = createCoverFetchQueue(deps);

		queue.enqueue(["7"]);
		await queue.whenIdle();

		expect(deps.persisted).toEqual([]);
		expect(deps.downloads).toEqual([]);
	});

	test("does not persist when image resolve fails", async () => {
		const deps = memoryDeps({
			keys: new Map([["9", null]]),
			resolveImageUrl: async () => null,
		});
		const queue = createCoverFetchQueue(deps);

		queue.enqueue(["9"]);
		await queue.whenIdle();

		expect(deps.persisted).toEqual([]);
		expect(deps.downloads).toEqual([]);
	});

	test("does not persist when download fails", async () => {
		const deps = memoryDeps({
			keys: new Map([["11", null]]),
			downloadBytes: async () => null,
		});
		const queue = createCoverFetchQueue(deps);

		queue.enqueue(["11"]);
		await queue.whenIdle();

		expect(deps.persisted).toEqual([]);
	});

	test("does not persist when optimize throws", async () => {
		const deps = memoryDeps({
			keys: new Map([["13", null]]),
			optimize: async () => {
				throw new Error("sharp failed");
			},
		});
		const queue = createCoverFetchQueue(deps);

		queue.enqueue(["13"]);
		await queue.whenIdle();

		expect(deps.persisted).toEqual([]);
	});
});
