import z from "zod/v4";

const envSchema = z.object({
	username: z.string(),
	password: z.string(),
});

export const env = envSchema.parse(process.env);
