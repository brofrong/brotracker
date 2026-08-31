import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { genericOAuth } from "better-auth/plugins";
import { count } from "drizzle-orm";
import * as authSchema from "../db/auth/auth.schema";
import { user } from "../db/auth/auth.schema";
import { db } from "../db/db";
import { env } from "../utils/env";
import { OIDC_ACCOUNT_ISSUER, OIDC_PROVIDER_ID } from "./account-issuer";
import {
	type AuthMode,
	assertLocalSignUpAllowed,
	resolveAuthMode,
} from "./auth-mode";

export async function countUsers(): Promise<number> {
	const [row] = await db.select({ value: count() }).from(user);
	return Number(row?.value ?? 0);
}

export function getAuthMode(): AuthMode {
	return resolveAuthMode(env);
}

export function createAuth(secret: string) {
	const mode = getAuthMode();

	const base = {
		baseURL: env.BETTER_AUTH_URL,
		secret,
		trustedOrigins: [env.CORS_ORIGIN],
		session: {
			expiresIn: 60 * 60 * 24 * 365, // 1 year
			updateAge: 60 * 60 * 24 * 7, // refresh expiry every 7 days of use
		},
		database: drizzleAdapter(db, {
			provider: "pg" as const,
			schema: authSchema,
		}),
	};

	if (mode === "oidc") {
		const clientId = env.OIDC_CLIENT_ID;
		const clientSecret = env.OIDC_CLIENT_SECRET;
		const discoveryUrl = env.OIDC_DISCOVERY_URL;
		if (!clientId || !clientSecret || !discoveryUrl) {
			throw new Error(
				"OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, and OIDC_DISCOVERY_URL are required",
			);
		}
		return betterAuth({
			...base,
			plugins: [
				genericOAuth({
					config: [
						{
							providerId: OIDC_PROVIDER_ID,
							discoveryUrl,
							clientId,
							clientSecret,
							scopes: ["openid", "profile", "email"],
							pkce: true,
							accountIssuer: OIDC_ACCOUNT_ISSUER,
						},
					],
				}),
			],
		});
	}

	return betterAuth({
		...base,
		emailAndPassword: {
			enabled: true,
		},
		hooks: {
			before: createAuthMiddleware(async (ctx) => {
				if (ctx.path !== "/sign-up/email") {
					return;
				}
				const userCount = await countUsers();
				try {
					assertLocalSignUpAllowed(userCount);
				} catch {
					throw new APIError("FORBIDDEN", {
						message: "Registration is closed",
					});
				}
			}),
		},
	});
}

export type Auth = ReturnType<typeof createAuth>;

/** Set by `initAuth` after migrations + secret bootstrap. */
export let auth!: Auth;

export function initAuth(secret: string): Auth {
	auth = createAuth(secret);
	return auth;
}
