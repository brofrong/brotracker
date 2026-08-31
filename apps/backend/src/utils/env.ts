import z from "zod";

const envSchema = z
	.object({
		DATABASE_URL: z
			.string()
			.default("postgresql://brotracker:brotracker@localhost:5432/brotracker"),
		PORT: z.coerce.number().default(3101),
		/** Browser origin allowed to call the API (required when the frontend uses credentials). */
		CORS_ORIGIN: z.string().default("http://localhost:3100"),
		S3_ENDPOINT: z.string().default("http://localhost:9000"),
		S3_ACCESS_KEY: z.string().default("minioadmin"),
		S3_SECRET_KEY: z.string().default("minioadmin"),
		S3_BUCKET: z.string().default("brotracker"),
		/** Byparr / FlareSolverr-compatible endpoint for RuTracker Cloudflare bypass. */
		BYPARR_URL: z.string().default("http://localhost:8191/v1"),
		BETTER_AUTH_URL: z.string().url().default("http://localhost:3101"),
		/** When set (non-empty), generic OIDC is required; otherwise local email/password. */
		OIDC_CLIENT_ID: z.string().optional(),
		OIDC_CLIENT_SECRET: z.string().optional(),
		OIDC_DISCOVERY_URL: z.string().optional(),
		/**
		 * Directory with frontend SPA assets (vite `dist/client`).
		 * Default: `apps/backend/public` (populated by Docker build).
		 */
		STATIC_DIR: z.string().optional(),
	})
	.superRefine((data, ctx) => {
		const id = data.OIDC_CLIENT_ID?.trim();
		if (!id) return;
		if (!data.OIDC_CLIENT_SECRET?.trim()) {
			ctx.addIssue({
				code: "custom",
				message: "OIDC_CLIENT_SECRET is required when OIDC_CLIENT_ID is set",
				path: ["OIDC_CLIENT_SECRET"],
			});
		}
		const discovery = data.OIDC_DISCOVERY_URL?.trim();
		if (!discovery) {
			ctx.addIssue({
				code: "custom",
				message: "OIDC_DISCOVERY_URL is required when OIDC_CLIENT_ID is set",
				path: ["OIDC_DISCOVERY_URL"],
			});
			return;
		}
		try {
			new URL(discovery);
		} catch {
			ctx.addIssue({
				code: "custom",
				message: "OIDC_DISCOVERY_URL must be a valid URL",
				path: ["OIDC_DISCOVERY_URL"],
			});
		}
	})
	.transform((data) => {
		const id = data.OIDC_CLIENT_ID?.trim() || undefined;
		const discovery = data.OIDC_DISCOVERY_URL?.trim() || undefined;
		return {
			...data,
			OIDC_CLIENT_ID: id,
			OIDC_CLIENT_SECRET: id ? data.OIDC_CLIENT_SECRET?.trim() : undefined,
			OIDC_DISCOVERY_URL: discovery,
		};
	});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(
	input: Record<string, string | undefined> = process.env,
): Env {
	return envSchema.parse(input);
}

export const env = parseEnv();
