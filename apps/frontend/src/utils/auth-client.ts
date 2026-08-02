import { createAuthClient } from "better-auth/client";
import { genericOAuthClient } from "better-auth/client/plugins";
import { env } from "./env";

function getAuthBaseURL(): string {
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

export async function signOutAndRedirect(): Promise<void> {
	await authClient.signOut();
	await redirectToAuthentikSignIn();
}
