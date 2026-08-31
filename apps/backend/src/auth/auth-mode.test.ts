import { describe, expect, test } from "bun:test";
import { buildAuthModeResponse, resolveAuthMode } from "./auth-mode";

describe("resolveAuthMode", () => {
	test("undefined, empty, or whitespace → local", () => {
		expect(resolveAuthMode({ OIDC_CLIENT_ID: undefined })).toBe("local");
		expect(resolveAuthMode({ OIDC_CLIENT_ID: "" })).toBe("local");
		expect(resolveAuthMode({ OIDC_CLIENT_ID: "  " })).toBe("local");
	});

	test("non-empty client id → oidc", () => {
		expect(resolveAuthMode({ OIDC_CLIENT_ID: "cid" })).toBe("oidc");
		expect(resolveAuthMode({ OIDC_CLIENT_ID: "  cid  " })).toBe("oidc");
	});
});

describe("buildAuthModeResponse", () => {
	test("registrationOpen only in local mode with zero users", () => {
		expect(buildAuthModeResponse({ mode: "local", userCount: 0 })).toEqual({
			mode: "local",
			registrationOpen: true,
		});
		expect(buildAuthModeResponse({ mode: "local", userCount: 1 })).toEqual({
			mode: "local",
			registrationOpen: false,
		});
		expect(buildAuthModeResponse({ mode: "oidc", userCount: 0 })).toEqual({
			mode: "oidc",
			registrationOpen: false,
		});
	});
});
