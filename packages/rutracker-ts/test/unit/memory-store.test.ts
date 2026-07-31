import { describe, expect, test } from "bun:test";
import { createMemoryStore } from "../../src/tracker/storage/memory-store";

describe("createMemoryStore", () => {
	test("set and get a value", async () => {
		const store = createMemoryStore();
		await store.set("key", "value");
		expect(await store.get("key")).toBe("value");
	});

	test("returns undefined for missing key", async () => {
		const store = createMemoryStore();
		expect(await store.get("missing")).toBeUndefined();
	});

	test("overwrites an existing key", async () => {
		const store = createMemoryStore();
		await store.set("key", "first");
		await store.set("key", "second");
		expect(await store.get("key")).toBe("second");
	});

	test("delete removes a key", async () => {
		const store = createMemoryStore();
		await store.set("key", "value");
		await store.delete("key");
		expect(await store.get("key")).toBeUndefined();
	});

	test("delete on missing key is a no-op", async () => {
		const store = createMemoryStore();
		await store.delete("missing");
		expect(await store.get("missing")).toBeUndefined();
	});
});
