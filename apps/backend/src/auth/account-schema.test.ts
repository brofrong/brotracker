import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { getTableColumns } from "drizzle-orm";
import { account } from "../db/auth/auth.schema";

const DRIZZLE_DIR = `${import.meta.dir}/../../drizzle`;

describe("account schema (Better Auth 1.7.3+)", () => {
	test("account has no issuer column; identity is providerId + accountId", () => {
		const columns = getTableColumns(account);
		expect(columns).not.toHaveProperty("issuer");
		expect(columns.providerId).toBeDefined();
		expect(columns.accountId).toBeDefined();
	});

	test("a migration drops the issuer index before the column", async () => {
		const dir = readdirSync(DRIZZLE_DIR).find((name) =>
			name.endsWith("_drop_account_issuer"),
		);
		expect(dir).toBeDefined();
		const sql = await Bun.file(`${DRIZZLE_DIR}/${dir}/migration.sql`).text();
		const dropIndex = sql.indexOf('DROP INDEX "account_issuer_accountId_uidx"');
		const dropColumn = sql.indexOf('DROP COLUMN "issuer"');
		expect(dropIndex).toBeGreaterThan(-1);
		expect(dropColumn).toBeGreaterThan(dropIndex);
	});
});
