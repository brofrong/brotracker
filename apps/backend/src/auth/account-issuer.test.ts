import { describe, expect, test } from "bun:test";
import { getTableColumns } from "drizzle-orm";
import { account } from "../db/auth/auth.schema";
import { issuerForExistingAccount } from "./account-issuer";

describe("account issuer (Better Auth 1.7)", () => {
	test("account table includes issuer", () => {
		expect(getTableColumns(account).issuer).toBeDefined();
	});

	test("backfills credential vs generic OAuth namespaces", () => {
		expect(issuerForExistingAccount("credential")).toBe("local:credential");
		expect(issuerForExistingAccount("authentik")).toBe("local:oauth:authentik");
		expect(issuerForExistingAccount("team/github")).toBe(
			"local:oauth:team%2Fgithub",
		);
	});

	test("drizzle migration backfills issuer before NOT NULL", async () => {
		const sql = await Bun.file(
			`${import.meta.dir}/../../drizzle/20260825193309_bright_vision/migration.sql`,
		).text();
		expect(sql).toContain("local:credential");
		expect(sql).toContain("local:oauth:");
		expect(sql.indexOf("UPDATE")).toBeGreaterThan(-1);
		expect(sql.indexOf("UPDATE")).toBeLessThan(sql.indexOf("SET NOT NULL"));
	});
});
