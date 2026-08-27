import { z } from "zod";
import { KINOZAL_MIRRORS } from "@brotracker/rutracker-ts/tracker/search-engine/kinozal/constants";
import { proxyUrlSchema } from "./rutracker-config";

export const trackerProviderConfigSchema = z.object({
	login: z.string().min(1),
	password: z.string().min(1),
	proxyUrl: proxyUrlSchema,
	enabled: z.boolean().optional().default(true),
});

const kinozalMirrorUrls = KINOZAL_MIRRORS.map((mirror) => mirror.url) as [
	string,
	...string[],
];

export const kinozalConfigSchema = trackerProviderConfigSchema.extend({
	autoHost: z.boolean().optional().default(true),
	host: z.enum(kinozalMirrorUrls).nullable().optional(),
});

export {
	loadKinozalConfig,
} from "./provider-config.live";
