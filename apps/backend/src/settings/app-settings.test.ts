import { describe, expect, test } from "bun:test";
import { BETTER_AUTH_SECRET_KEY } from "./app-settings";

describe("app settings", () => {
	test("Better Auth secret uses a stable app_settings key", () => {
		expect(BETTER_AUTH_SECRET_KEY).toBe("better_auth_secret");
	});
});
