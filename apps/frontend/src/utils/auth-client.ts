import { createAuthClient } from "better-auth/client";
import { genericOAuthClient } from "better-auth/client/plugins";
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
	plugins: [genericOAuthClient()],
	fetchOptions: {
		credentials: "include",
	},
});

export async function redirectToAuthentikSignIn(): Promise<void> {
	await authClient.signIn.oauth2({
		providerId: "authentik",
		callbackURL: window.location.href,
	});
}

export async function redirectToSignIn(): Promise<void> {
	const { mode } = await fetchAuthMode(getAuthBaseURL());
	if (mode === "authentik") {
		await redirectToAuthentikSignIn();
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
