import { describe, expect, test } from "bun:test";
import { appRouter } from "../appRouter";

describe("protectedProcedure", () => {
	test("hello returns UNAUTHORIZED without session", async () => {
		const caller = appRouter.createCaller({ session: null });

		await expect(caller.hello()).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
	});
});
