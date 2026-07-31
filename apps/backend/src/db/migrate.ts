import { migrate } from "drizzle-orm/bun-sql/migrator";
import path from "node:path";
import { logger } from "../utils/logger";
import { db } from "./db";

export async function runMigrations() {
	const migrationsFolder = path.join(import.meta.dir, "../../drizzle");
	logger.info({ migrationsFolder }, "Applying database migrations");
	await migrate(db, { migrationsFolder });
	logger.info("Database migrations applied");
}
