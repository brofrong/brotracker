import { describe, expect, test } from "bun:test";

import { err, ok } from "neverthrow";

import { sharedResult } from "../../src/tracker/single-flight";

describe("sharedResult", () => {
	test("concurrent callers share one run per owner and key", async () => {
		const owner = {};
		let calls = 0;
		const task = async () => {
			calls += 1;
			const call = calls;
			await Bun.sleep(5);
			return ok(call);
		};

		const results = await Promise.all([
			sharedResult(owner, "cf", task),
			sharedResult(owner, "cf", task),
			sharedResult({}, "cf", task),
		]);

		expect(results.map((r) => r._unsafeUnwrap())).toEqual([1, 1, 2]);
		expect(calls).toBe(2);
	});

	test("reuses a success within the window but retries after a failure", async () => {
		const owner = {};
		let calls = 0;
		const failing = async () => {
			calls += 1;
			return err(new Error("solver down"));
		};
		const succeeding = async () => {
			calls += 1;
			return ok("cookie");
		};

		expect((await sharedResult(owner, "cf", failing, 1000)).isErr()).toBe(true);
		expect((await sharedResult(owner, "cf", succeeding, 1000)).isOk()).toBe(
			true,
		);
		expect((await sharedResult(owner, "cf", failing, 1000)).isOk()).toBe(true);
		expect(calls).toBe(2);
	});
});
