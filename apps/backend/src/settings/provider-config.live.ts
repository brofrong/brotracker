import { eq } from "drizzle-orm";
import { db } from "../db/db";
import { providerSettings } from "../db/settings/provider-settings.schema";
import {
	createProviderConfig,
	type ProviderStore,
} from "./provider-config";

export const dbProviderStore: ProviderStore = {
	load: async (provider) => {
		const rows = await db
			.select({ config: providerSettings.config })
			.from(providerSettings)
			.where(eq(providerSettings.provider, provider))
			.limit(1);
		return rows[0]?.config ?? null;
	},
	save: async (provider, config) => {
		const now = new Date();
		await db
			.insert(providerSettings)
			.values({
				provider,
				config,
				updatedAt: now,
			})
			.onConflictDoUpdate({
				target: providerSettings.provider,
				set: { config, updatedAt: now },
			});
	},
};

export const providerConfig = createProviderConfig(dbProviderStore);

/** Internal full config for tracker/clients — not for settings UI. */
export async function loadRutrackerConfig() {
	return providerConfig.loadRutracker();
}

export async function loadQbittorrentConfig() {
	return providerConfig.loadQbittorrent();
}
