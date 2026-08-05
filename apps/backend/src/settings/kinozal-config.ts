import { z } from "zod";
import { proxyUrlSchema } from "./rutracker-config";

export const trackerProviderConfigSchema = z.object({
	login: z.string().min(1),
	password: z.string().min(1),
	proxyUrl: proxyUrlSchema,
	enabled: z.boolean().optional().default(true),
});

export const kinozalConfigSchema = trackerProviderConfigSchema;

export {
	loadKinozalConfig,
} from "./provider-config.live";
