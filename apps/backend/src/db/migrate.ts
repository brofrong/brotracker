import { drizzle } from "drizzle-orm/bun-sql";
import { migrate } from "drizzle-orm/bun-sql/migrator";
import path from "node:path";
import { logger } from "../utils/logger";

const DEFAULT_DATABASE_URL =
	"postgresql://brotracker:brotracker@localhost:5432/brotracker";

export async function runMigrations() {
	const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
	const migrationsFolder = path.join(import.meta.dir, "../../drizzle");
	const db = drizzle(databaseUrl);

	logger.info({ migrationsFolder }, "Applying database migrations");
	await migrate(db, { migrationsFolder });
	logger.info("Database migrations applied");
}

if (import.meta.main) {
	try {
		await runMigrations();
		process.exit(0);
	} catch (err) {
		logger.error({ err }, "Database migration failed");
		process.exit(1);
	}
}
