import { describe, expect, test } from "bun:test";
import { extractKinozalCfClearance } from "../../src/tracker/search-engine/kinozal/cf";

describe("extractKinozalCfClearance", () => {
	test("prefers kinozal.me domain over cloudflare.com", () => {
		const cookie = extractKinozalCfClearance([
			{
				name: "cf_clearance",
				value: "cf-cloud",
				domain: ".cloudflare.com",
			},
			{
				name: "cf_clearance",
				value: "cf-kinozal",
				domain: ".kinozal.me",
			},
		]);
		expect(cookie?.value).toBe("cf-kinozal");
	});

	test("returns null when missing", () => {
		expect(extractKinozalCfClearance([])).toBeNull();
		expect(
			extractKinozalCfClearance([{ name: "cf_clearance", value: "" }]),
		).toBeNull();
	});
});
