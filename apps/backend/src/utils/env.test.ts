import { describe, expect, test } from "bun:test";
import { parseEnv } from "./env";

describe("parseEnv Authentik optionality", () => {
	const base = {
		DATABASE_URL: "postgresql://brotracker:brotracker@localhost:5432/brotracker",
	};

	test("omitted Authentik → accepted (local mode)", () => {
		const parsed = parseEnv(base);
		expect(parsed.AUTHENTIK_CLIENT_ID).toBeUndefined();
		expect(parsed.AUTHENTIK_CLIENT_SECRET).toBeUndefined();
	});

	test("whitespace-only client id → treated as unset", () => {
		const parsed = parseEnv({
			...base,
			AUTHENTIK_CLIENT_ID: "  ",
			AUTHENTIK_CLIENT_SECRET: "secret",
		});
		expect(parsed.AUTHENTIK_CLIENT_ID).toBeUndefined();
		expect(parsed.AUTHENTIK_CLIENT_SECRET).toBeUndefined();
	});

	test("client id + secret → accepted", () => {
		const parsed = parseEnv({
			...base,
			AUTHENTIK_CLIENT_ID: "cid",
			AUTHENTIK_CLIENT_SECRET: "secret",
		});
		expect(parsed.AUTHENTIK_CLIENT_ID).toBe("cid");
		expect(parsed.AUTHENTIK_CLIENT_SECRET).toBe("secret");
	});

	test("client id without secret → fails", () => {
		expect(() =>
			parseEnv({
				...base,
				AUTHENTIK_CLIENT_ID: "cid",
			}),
		).toThrow();
	});
});
