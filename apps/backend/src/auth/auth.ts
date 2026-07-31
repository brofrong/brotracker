import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { genericOAuth } from "better-auth/plugins";
import * as authSchema from "../db/auth/auth.schema";
import { db } from "../db/db";
import { env } from "../utils/env";

export function createAuth(secret: string) {
	return betterAuth({
		baseURL: env.BETTER_AUTH_URL,
		secret,
		trustedOrigins: [env.CORS_ORIGIN],
		database: drizzleAdapter(db, {
			provider: "pg",
			schema: authSchema,
		}),
		plugins: [
			genericOAuth({
				config: [
					{
						providerId: "authentik",
						discoveryUrl: env.AUTHENTIK_DISCOVERY_URL,
						clientId: env.AUTHENTIK_CLIENT_ID,
						clientSecret: env.AUTHENTIK_CLIENT_SECRET,
						scopes: ["openid", "profile", "email"],
						pkce: true,
					},
				],
			}),
		],
	});
}

export type Auth = ReturnType<typeof createAuth>;

/** Set by `initAuth` after migrations + secret bootstrap. */
export let auth!: Auth;

export function initAuth(secret: string): Auth {
	auth = createAuth(secret);
	return auth;
}
