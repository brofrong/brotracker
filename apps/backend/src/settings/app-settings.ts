import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db } from "../db/db";
import { appSettings } from "../db/settings/app-settings.schema";
import { logger } from "../utils/logger";

export const BETTER_AUTH_SECRET_KEY = "better_auth_secret";

/** Load Better Auth signing secret from DB, or generate and persist on first boot. */
export async function ensureBetterAuthSecret(): Promise<string> {
	const existing = await db
		.select({ value: appSettings.value })
		.from(appSettings)
		.where(eq(appSettings.key, BETTER_AUTH_SECRET_KEY))
		.limit(1);

	const found = existing[0]?.value;
	if (found && found.length >= 32) {
		return found;
	}

	const generated = randomBytes(32).toString("base64url");

	await db
		.insert(appSettings)
		.values({
			key: BETTER_AUTH_SECRET_KEY,
			value: generated,
		})
		.onConflictDoNothing({ target: appSettings.key });

	const row = await db
		.select({ value: appSettings.value })
		.from(appSettings)
		.where(eq(appSettings.key, BETTER_AUTH_SECRET_KEY))
		.limit(1);

	const secret = row[0]?.value;
	if (!secret || secret.length < 32) {
		throw new Error("Failed to persist Better Auth secret in app_settings");
	}

	if (secret === generated) {
		logger.info("Generated and stored Better Auth secret in app_settings");
	}

	return secret;
}
