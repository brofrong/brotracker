import type { AppRouter } from "@brotracker/backend/appRouter";
import { QueryClient } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink, TRPCClientError } from "@trpc/client";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { redirectToAuthentikSignIn } from "./auth-client";
import { env } from "./env";

let unauthorizedRedirectPending = false;

function handleUnauthorized() {
	if (unauthorizedRedirectPending || typeof window === "undefined") {
		return;
	}
	unauthorizedRedirectPending = true;
	void redirectToAuthentikSignIn();
}

export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			retry: false,
		},
		mutations: {
			retry: false,
		},
	},
});

queryClient.getQueryCache().config.onError = (error) => {
	if (error instanceof TRPCClientError && error.data?.code === "UNAUTHORIZED") {
		handleUnauthorized();
	}
};

queryClient.getMutationCache().config.onError = (error) => {
	if (error instanceof TRPCClientError && error.data?.code === "UNAUTHORIZED") {
		handleUnauthorized();
	}
};

function getBackendHttpUrl(): string {
	const host = env.VITE_BACKEND_URL.trim();
	if (!host || host === "/") {
		return "/trpc";
	}
	if (host.startsWith("http://") || host.startsWith("https://")) {
		return `${host.replace(/\/+$/, "")}/trpc`;
	}
	return `http://${host}/trpc`;
}

export const trpcClient = createTRPCClient<AppRouter>({
	links: [
		httpBatchLink({
			url: getBackendHttpUrl(),
			fetch(url, options) {
				return fetch(url, {
					...options,
					credentials: "include",
				});
			},
		}),
	],
});

export const trpc = createTRPCOptionsProxy<AppRouter>({
	client: trpcClient,
	queryClient,
});
