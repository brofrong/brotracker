import z from "zod";

const envSchema = z
	.object({
		DATABASE_URL: z
			.string()
			.default(
				"postgresql://brotracker:brotracker@localhost:5432/brotracker",
			),
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
		/** When set (non-empty), Authentik OIDC is required; otherwise local email/password. */
		AUTHENTIK_CLIENT_ID: z.string().optional(),
		AUTHENTIK_CLIENT_SECRET: z.string().optional(),
		AUTHENTIK_DISCOVERY_URL: z
			.string()
			.url()
			.default(
				"http://localhost:9080/application/o/brotracker/.well-known/openid-configuration",
			),
		/**
		 * Directory with frontend SPA assets (vite `dist/client`).
		 * Default: `apps/backend/public` (populated by Docker build).
		 */
		STATIC_DIR: z.string().optional(),
	})
	.superRefine((data, ctx) => {
		const id = data.AUTHENTIK_CLIENT_ID?.trim();
		if (!id) return;
		if (!data.AUTHENTIK_CLIENT_SECRET?.trim()) {
			ctx.addIssue({
				code: "custom",
				message:
					"AUTHENTIK_CLIENT_SECRET is required when AUTHENTIK_CLIENT_ID is set",
				path: ["AUTHENTIK_CLIENT_SECRET"],
			});
		}
	})
	.transform((data) => {
		const id = data.AUTHENTIK_CLIENT_ID?.trim() || undefined;
		return {
			...data,
			AUTHENTIK_CLIENT_ID: id,
			AUTHENTIK_CLIENT_SECRET: id
				? data.AUTHENTIK_CLIENT_SECRET!.trim()
				: undefined,
		};
	});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(
	input: Record<string, string | undefined> = process.env,
): Env {
	return envSchema.parse(input);
}

export const env = parseEnv();
