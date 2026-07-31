import { describe, expect, test } from "bun:test";
import {
	extractCfClearance,
	normalizeSolverUrl,
	toStoredCookie,
} from "../../src/tracker/search-engine/rutracker/cf";

describe("normalizeSolverUrl", () => {
	test("appends /v1 when missing", () => {
		expect(normalizeSolverUrl("http://localhost:8191")).toBe(
			"http://localhost:8191/v1",
		);
		expect(normalizeSolverUrl("http://localhost:8191/")).toBe(
			"http://localhost:8191/v1",
		);
	});

	test("keeps existing /v1", () => {
		expect(normalizeSolverUrl("http://byparr:8191/v1")).toBe(
			"http://byparr:8191/v1",
		);
	});
});

describe("extractCfClearance", () => {
	test("picks cf_clearance and maps expires", () => {
		const cf = extractCfClearance([
			{ name: "bb_session", value: "x" },
			{
				name: "cf_clearance",
				value: "token",
				domain: ".rutracker.org",
				path: "/",
				expires: 1_900_000_000,
				httpOnly: true,
				secure: true,
			},
		]);

		expect(cf).toEqual({
			name: "cf_clearance",
			value: "token",
			domain: ".rutracker.org",
			path: "/",
			expires: 1_900_000_000,
			httpOnly: true,
			secure: true,
		});
	});

	test("treats negative expires as session (null)", () => {
		expect(
			toStoredCookie({
				name: "cf_clearance",
				value: "t",
				expires: -1,
			}).expires,
		).toBeNull();
	});

	test("returns null when missing", () => {
		expect(extractCfClearance([{ name: "other", value: "1" }])).toBeNull();
		expect(extractCfClearance([{ name: "cf_clearance", value: "" }])).toBeNull();
	});

	test("prefers rutracker.org over cloudflare.com clearance", () => {
		const cf = extractCfClearance([
			{
				name: "cf_clearance",
				value: "cf-iframe",
				domain: ".cloudflare.com",
			},
			{
				name: "cf_clearance",
				value: "cf-site",
				domain: ".rutracker.org",
			},
		]);
		expect(cf?.value).toBe("cf-site");
		expect(cf?.domain).toBe(".rutracker.org");
	});

	test("rejects cloudflare.com-only clearance", () => {
		expect(
			extractCfClearance([
				{
					name: "cf_clearance",
					value: "cf-iframe",
					domain: ".cloudflare.com",
				},
			]),
		).toBeNull();
	});
});
