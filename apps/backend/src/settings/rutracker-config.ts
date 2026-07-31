import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/db";
import {
	type RutrackerProviderConfig,
	providerSettings,
} from "../db/settings/provider-settings.schema";

export const RUTRACKER_PROVIDER = "rutracker";

/** http(s) or socks5, optional user:pass@host:port */
export const proxyUrlSchema = z
	.union([z.string(), z.null(), z.undefined()])
	.transform((value) => {
		if (value == null) {
			return null;
		}
		const trimmed = value.trim();
		return trimmed === "" ? null : trimmed;
	})
	.refine((value) => {
		if (value == null) {
			return true;
		}
		try {
			const url = new URL(value);
			return ["http:", "https:", "socks5:"].includes(url.protocol);
		} catch {
			return false;
		}
	}, "Proxy must be http://, https://, or socks5:// URL (optional user:pass@host:port)");

export const rutrackerConfigSchema = z.object({
	login: z.string().min(1),
	password: z.string().min(1),
	proxyUrl: proxyUrlSchema,
});

const storedConfigSchema = z.object({
	login: z.string(),
	password: z.string(),
	proxyUrl: z.string().nullable(),
});

export async function loadRutrackerConfig(): Promise<RutrackerProviderConfig | null> {
	const rows = await db
		.select({ config: providerSettings.config })
		.from(providerSettings)
		.where(eq(providerSettings.provider, RUTRACKER_PROVIDER))
		.limit(1);

	const row = rows[0];
	if (!row) {
		return null;
	}

	const parsed = storedConfigSchema.safeParse(row.config);
	if (!parsed.success) {
		return null;
	}
	if (!parsed.data.login || !parsed.data.password) {
		return null;
	}

	return {
		login: parsed.data.login,
		password: parsed.data.password,
		proxyUrl: parsed.data.proxyUrl,
	};
}

export async function saveRutrackerConfig(
	config: RutrackerProviderConfig,
): Promise<void> {
	const now = new Date();
	await db
		.insert(providerSettings)
		.values({
			provider: RUTRACKER_PROVIDER,
			config,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: providerSettings.provider,
			set: { config, updatedAt: now },
		});
}
