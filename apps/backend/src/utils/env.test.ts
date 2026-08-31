import { describe, expect, test } from "bun:test";
import { parseEnv } from "./env";

describe("parseEnv OIDC optionality", () => {
	const base = {
		DATABASE_URL:
			"postgresql://brotracker:brotracker@localhost:5432/brotracker",
	};
	const discovery = "https://idp.example/.well-known/openid-configuration";

	test("omitted OIDC → accepted (local mode)", () => {
		const parsed = parseEnv(base);
		expect(parsed.OIDC_CLIENT_ID).toBeUndefined();
		expect(parsed.OIDC_CLIENT_SECRET).toBeUndefined();
		expect(parsed.OIDC_DISCOVERY_URL).toBeUndefined();
	});

	test("whitespace-only client id → treated as unset", () => {
		const parsed = parseEnv({
			...base,
			OIDC_CLIENT_ID: "  ",
			OIDC_CLIENT_SECRET: "secret",
			OIDC_DISCOVERY_URL: discovery,
		});
		expect(parsed.OIDC_CLIENT_ID).toBeUndefined();
		expect(parsed.OIDC_CLIENT_SECRET).toBeUndefined();
	});

	test("client id + secret + discovery URL → accepted", () => {
		const parsed = parseEnv({
			...base,
			OIDC_CLIENT_ID: "cid",
			OIDC_CLIENT_SECRET: "secret",
			OIDC_DISCOVERY_URL: discovery,
		});
		expect(parsed.OIDC_CLIENT_ID).toBe("cid");
		expect(parsed.OIDC_CLIENT_SECRET).toBe("secret");
		expect(parsed.OIDC_DISCOVERY_URL).toBe(discovery);
	});

	test("client id without secret → fails", () => {
		expect(() =>
			parseEnv({
				...base,
				OIDC_CLIENT_ID: "cid",
				OIDC_DISCOVERY_URL: discovery,
			}),
		).toThrow();
	});

	test("client id without discovery URL → fails", () => {
		expect(() =>
			parseEnv({
				...base,
				OIDC_CLIENT_ID: "cid",
				OIDC_CLIENT_SECRET: "secret",
			}),
		).toThrow();
	});

	test("client id with invalid discovery URL → fails", () => {
		expect(() =>
			parseEnv({
				...base,
				OIDC_CLIENT_ID: "cid",
				OIDC_CLIENT_SECRET: "secret",
				OIDC_DISCOVERY_URL: "not-a-url",
			}),
		).toThrow();
	});
});
