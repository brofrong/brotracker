import { QueryClient } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import type { AppRouter } from "@brotracker/backend/appRouter";
import { env } from "./env";

export const queryClient = new QueryClient();

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
