import z from "zod";

const envSchema = z.object({
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
	S3_PUBLIC_URL: z.string().default("http://localhost:9000/brotracker"),
	/** Byparr / FlareSolverr-compatible endpoint for RuTracker Cloudflare bypass. */
	BYPARR_URL: z.string().default("http://localhost:8191/v1"),
	BETTER_AUTH_URL: z.string().url().default("http://localhost:3101"),
	AUTHENTIK_CLIENT_ID: z.string().min(1),
	AUTHENTIK_CLIENT_SECRET: z.string().min(1),
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
});

export const env = envSchema.parse(process.env);
