import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	cookiesToHeader,
	createFileStore,
	fileStoreSchema,
	type FileStoreData,
	type StoredCookie,
} from "../../src/tracker/storage/file-store";

const tempDirs: string[] = [];

async function tempStorePath(name = "session.json"): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "rutracker-file-store-"));
	tempDirs.push(dir);
	return join(dir, name);
}

afterEach(async () => {
	await Promise.all(
		tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
	);
});

const futureExpires = Math.floor(Date.now() / 1000) + 60 * 60;
const pastExpires = Math.floor(Date.now() / 1000) - 60;

function cookie(
	partial: Pick<StoredCookie, "name" | "value"> & Partial<StoredCookie>,
): StoredCookie {
	return {
		domain: ".rutracker.org",
		path: "/",
		expires: futureExpires,
		...partial,
	};
}

describe("createFileStore", () => {
	test("read returns empty store when file is missing", async () => {
		const path = await tempStorePath();
		const store = createFileStore(path);

		const result = await store.read();
		expect(result.isOk()).toBe(true);
		if (result.isOk()) {
			expect(result.value).toEqual({
				cfClearance: null,
				sessionCookies: [],
				userAgent: null,
				updatedAt: null,
			});
		}
		expect(await Bun.file(path).exists()).toBe(false);
	});

	test("write creates file and read loads it", async () => {
		const path = await tempStorePath("nested/session.json");
		const store = createFileStore(path);

		const data: FileStoreData = {
			cfClearance: cookie({ name: "cf_clearance", value: "cf-token" }),
			sessionCookies: [cookie({ name: "bb_session", value: "sess" })],
			userAgent: "TestAgent/1.0",
			updatedAt: null,
		};

		const written = await store.write(data);
		expect(written.isOk()).toBe(true);
		expect(await Bun.file(path).exists()).toBe(true);

		const loaded = await store.read();
		expect(loaded.isOk()).toBe(true);
		if (loaded.isOk()) {
			expect(loaded.value.cfClearance?.value).toBe("cf-token");
			expect(loaded.value.sessionCookies).toHaveLength(1);
			expect(loaded.value.sessionCookies[0]?.name).toBe("bb_session");
			expect(loaded.value.userAgent).toBe("TestAgent/1.0");
			expect(loaded.value.updatedAt).toBeNumber();
		}
	});

	test("persists across store instances", async () => {
		const path = await tempStorePath();
		const first = createFileStore(path);

		await first.write({
			cfClearance: cookie({ name: "cf_clearance", value: "persist-me" }),
			sessionCookies: [cookie({ name: "bb_session", value: "abc" })],
			userAgent: "UA",
			updatedAt: null,
		});

		const second = createFileStore(path);
		const loaded = await second.read();
		expect(loaded.isOk()).toBe(true);
		if (loaded.isOk()) {
			expect(loaded.value.cfClearance?.value).toBe("persist-me");
			expect(loaded.value.sessionCookies[0]?.value).toBe("abc");
			expect(loaded.value.userAgent).toBe("UA");
		}
	});

	test("rejects invalid schema on read", async () => {
		const path = await tempStorePath();
		await Bun.write(
			path,
			JSON.stringify({
				cfClearance: "not-an-object",
				sessionCookies: "nope",
			}),
		);

		const store = createFileStore(path);
		const result = await store.read();
		expect(result.isErr()).toBe(true);
		if (result.isErr()) {
			expect(result.error.message).toContain("Invalid file store schema");
		}
	});

	test("update patches cfClearance and sessionCookies", async () => {
		const path = await tempStorePath();
		const store = createFileStore(path);

		await store.write({
			cfClearance: null,
			sessionCookies: [],
			userAgent: null,
			updatedAt: null,
		});

		const updated = await store.update({
			cfClearance: cookie({ name: "cf_clearance", value: "new-cf" }),
			sessionCookies: [
				cookie({ name: "bb_session", value: "s1" }),
				cookie({ name: "bb_ssl", value: "1" }),
			],
			userAgent: "Mozilla/5.0",
		});

		expect(updated.isOk()).toBe(true);
		if (updated.isOk()) {
			expect(updated.value.cfClearance?.value).toBe("new-cf");
			expect(updated.value.sessionCookies.map((c) => c.name)).toEqual([
				"bb_session",
				"bb_ssl",
			]);
			expect(updated.value.userAgent).toBe("Mozilla/5.0");
		}

		const cleared = await store.update({
			cfClearance: null,
			sessionCookies: [],
			userAgent: null,
		});
		expect(cleared.isOk()).toBe(true);
		if (cleared.isOk()) {
			expect(cleared.value.cfClearance).toBeNull();
			expect(cleared.value.sessionCookies).toEqual([]);
			expect(cleared.value.userAgent).toBeNull();
		}
	});

	test("getCookieHeader includes cfClearance and skips expired cookies", async () => {
		const path = await tempStorePath();
		const store = createFileStore(path);

		await store.write({
			cfClearance: cookie({
				name: "cf_clearance",
				value: "cf-ok",
				expires: futureExpires,
			}),
			sessionCookies: [
				cookie({ name: "bb_session", value: "alive", expires: futureExpires }),
				cookie({ name: "old", value: "gone", expires: pastExpires }),
			],
			userAgent: null,
			updatedAt: null,
		});

		const header = await store.getCookieHeader();
		expect(header.isOk()).toBe(true);
		if (header.isOk()) {
			expect(header.value).toContain("cf_clearance=cf-ok");
			expect(header.value).toContain("bb_session=alive");
			expect(header.value).not.toContain("old=gone");
		}
	});

	test("getCookieHeader omits expired cfClearance", async () => {
		const path = await tempStorePath();
		const store = createFileStore(path);

		await store.write({
			cfClearance: cookie({
				name: "cf_clearance",
				value: "stale",
				expires: pastExpires,
			}),
			sessionCookies: [
				cookie({ name: "bb_session", value: "alive", expires: futureExpires }),
			],
			userAgent: null,
			updatedAt: null,
		});

		const header = await store.getCookieHeader();
		expect(header.isOk()).toBe(true);
		if (header.isOk()) {
			expect(header.value).toBe("bb_session=alive");
			expect(header.value).not.toContain("cf_clearance");
		}
	});

	test("cookiesToHeader filters expired entries", () => {
		const header = cookiesToHeader([
			cookie({ name: "a", value: "1", expires: futureExpires }),
			cookie({ name: "b", value: "2", expires: pastExpires }),
			cookie({ name: "c", value: "3", expires: null }),
		]);
		expect(header).toBe("a=1; c=3");
	});

	test("fileStoreSchema applies defaults", () => {
		const parsed = fileStoreSchema.parse({});
		expect(parsed).toEqual({
			cfClearance: null,
			sessionCookies: [],
			userAgent: null,
			updatedAt: null,
		});
	});
});
