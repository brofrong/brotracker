import z from "zod";

const envSchema = z.object({
	/**
	 * Backend host for tRPC/WS.
	 * Empty = same origin (production when backend serves the SPA).
	 * Dev example: `localhost:3101` or `http://localhost:3101`.
	 */
	VITE_BACKEND_URL: z.string().default(""),
});

export const env = envSchema.parse(import.meta.env);
