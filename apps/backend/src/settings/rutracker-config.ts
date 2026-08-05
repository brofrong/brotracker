import { z } from "zod";

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
	enabled: z.boolean().optional().default(true),
});

export {
	loadRutrackerConfig,
} from "./provider-config.live";
