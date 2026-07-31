import z from "zod";

const envSchema = z.object({
	/**
	 * Backend host for tRPC/WS.
	 * Empty = same origin (production when backend serves the SPA).
	 * Dev example: `localhost:3101` or `http://localhost:3101`.
	 */
	VITE_BACKEND_URL: z.string().default(""),
	/**
	 * App version baked in at build time from the monorepo root `package.json`
	 * (or `VITE_APP_VERSION` override).
	 */
	VITE_APP_VERSION: z.string().default("0.0.0"),
});

export const env = envSchema.parse(import.meta.env);
