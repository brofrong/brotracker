import { describe, expect, test } from "bun:test";
import { buildAuthModeResponse, resolveAuthMode } from "./auth-mode";

describe("resolveAuthMode", () => {
	test("undefined, empty, or whitespace → local", () => {
		expect(resolveAuthMode({ AUTHENTIK_CLIENT_ID: undefined })).toBe("local");
		expect(resolveAuthMode({ AUTHENTIK_CLIENT_ID: "" })).toBe("local");
		expect(resolveAuthMode({ AUTHENTIK_CLIENT_ID: "  " })).toBe("local");
	});

	test("non-empty client id → authentik", () => {
		expect(resolveAuthMode({ AUTHENTIK_CLIENT_ID: "cid" })).toBe("authentik");
		expect(resolveAuthMode({ AUTHENTIK_CLIENT_ID: "  cid  " })).toBe(
			"authentik",
		);
	});
});

describe("buildAuthModeResponse", () => {
	test("registrationOpen only in local mode with zero users", () => {
		expect(
			buildAuthModeResponse({ mode: "local", userCount: 0 }),
		).toEqual({ mode: "local", registrationOpen: true });
		expect(
			buildAuthModeResponse({ mode: "local", userCount: 1 }),
		).toEqual({ mode: "local", registrationOpen: false });
		expect(
			buildAuthModeResponse({ mode: "authentik", userCount: 0 }),
		).toEqual({ mode: "authentik", registrationOpen: false });
	});
});
