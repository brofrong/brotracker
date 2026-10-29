import { describe, expect, test } from "bun:test";

import { createSearchPool, withDeadline } from "./tracker-search-pool";

describe("withDeadline", () => {
	test("returns the value when it settles in time", async () => {
		expect(await withDeadline(Promise.resolve(1), 50)).toEqual({
			done: true,
			value: 1,
		});
	});

	test("reports a slow promise as not done", async () => {
		const slow = new Promise((resolve) => setTimeout(() => resolve(1), 200));
		expect(await withDeadline(slow, 10)).toEqual({ done: false });
	});

	test("waits without a deadline", async () => {
		const slow = new Promise((resolve) => setTimeout(() => resolve(2), 20));
		expect(await withDeadline(slow, undefined)).toEqual({
			done: true,
			value: 2,
		});
	});
});

describe("createSearchPool", () => {
	test("joins a running search with the same key", async () => {
		const pool = createSearchPool<number>({ ttlMs: 1000, now: () => 0 });
		let calls = 0;
		let release: (value: number) => void = () => {};
		const task = () => {
			calls += 1;
			return new Promise<number>((resolve) => {
				release = resolve;
			});
		};

		const first = pool.run("q", task);
		const second = pool.run("q", task);
		release(7);

		expect(await first).toBe(7);
		expect(await second).toBe(7);
		expect(calls).toBe(1);
	});

	test("reuses a finished result until the ttl passes", async () => {
		let now = 0;
		const pool = createSearchPool<number>({ ttlMs: 100, now: () => now });
		let calls = 0;
		const task = async () => {
			calls += 1;
			return calls;
		};

		expect(await pool.run("q", task)).toBe(1);
		now = 50;
		expect(await pool.run("q", task)).toBe(1);
		now = 200;
		expect(await pool.run("q", task)).toBe(2);
		expect(await pool.run("other", task)).toBe(3);
	});
});
