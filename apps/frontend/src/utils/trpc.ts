import type { AppRouter } from "@brotracker/backend/appRouter";
import { QueryClient } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { env } from "./env";
import { unauthorizedRedirect } from "./unauthorized-redirect";

export function handleTrpcUnauthorized(error: unknown): boolean {
	return unauthorizedRedirect.handleTrpcUnauthorized(error);
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
	handleTrpcUnauthorized(error);
};

queryClient.getMutationCache().config.onError = (error) => {
	handleTrpcUnauthorized(error);
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
