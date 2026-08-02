import { z } from "zod";

const pathSchema = z
	.string()
	.trim()
	.transform((value) => value.replace(/\/+$/, ""));

export const qbittorrentConfigSchema = z.object({
	url: z
		.string()
		.trim()
		.min(1, "URL is required")
		.refine((value) => {
			try {
				const parsed = new URL(value);
				return parsed.protocol === "http:" || parsed.protocol === "https:";
			} catch {
				return false;
			}
		}, "Must be a valid http(s) URL"),
	apiKey: z.string().min(1, "API key is required"),
	filmsPath: pathSchema,
	seriesPath: pathSchema,
});

export {
	loadQbittorrentConfig,
} from "./provider-config.live";
