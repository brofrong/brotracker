import { createAuthClient } from "better-auth/client";
import { fetchAuthMode } from "./auth-mode";
import { env } from "./env";

export function getAuthBaseURL(): string {
	const host = env.VITE_BACKEND_URL.trim();
	if (!host || host === "/") return ""; // same origin in prod
	if (host.startsWith("http")) return host.replace(/\/+$/, "");
	return `http://${host}`;
}

export const authClient = createAuthClient({
	baseURL: getAuthBaseURL(),
	fetchOptions: {
		credentials: "include",
	},
});

export function oidcSocialSignIn(callbackURL: string) {
	return {
		provider: "oidc" as const,
		callbackURL,
	};
}

export async function redirectToOidcSignIn(): Promise<void> {
	await authClient.signIn.social(oidcSocialSignIn(window.location.href));
}

export async function redirectToSignIn(): Promise<void> {
	const { mode } = await fetchAuthMode(getAuthBaseURL());
	if (mode === "oidc") {
		await redirectToOidcSignIn();
		return;
	}
	if (window.location.pathname !== "/login") {
		window.location.assign("/login");
	}
}

export async function signOutAndRedirect(): Promise<void> {
	await authClient.signOut();
	await redirectToSignIn();
}
