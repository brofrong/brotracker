import {
	createTRPCClient,
	createWSClient,
	wsLink,
} from "@trpc/client";
import type { AppRouter } from "@brotracker/backend/appRouter";
import type { inferRouterOutputs } from "@trpc/server";
import { env } from "./env";

export type QbittorentTorrent =
	inferRouterOutputs<AppRouter>["qbittorent"]["list"][number];

function getBackendWsUrl(): string {
	const host = env.VITE_BACKEND_URL.trim();
	if (!host || host === "/") {
		const protocol =
			typeof window !== "undefined" && window.location.protocol === "https:"
				? "wss:"
				: "ws:";
		const hostname =
			typeof window !== "undefined" ? window.location.host : "localhost";
		return `${protocol}//${hostname}`;
	}
	if (host.startsWith("https://")) {
		return host.replace("https://", "wss://");
	}
	if (host.startsWith("http://")) {
		return host.replace("http://", "ws://");
	}
	return `ws://${host}`;
}

let subscriptionClient: ReturnType<typeof createTRPCClient<AppRouter>> | null =
	null;

function getSubscriptionClient() {
	if (typeof window === "undefined") {
		throw new Error("WebSocket subscriptions are only available in the browser");
	}

	if (!subscriptionClient) {
		const wsClient = createWSClient({
			url: getBackendWsUrl(),
		});

		subscriptionClient = createTRPCClient<AppRouter>({
			links: [wsLink({ client: wsClient })],
		});
	}

	return subscriptionClient;
}

export function subscribeToTorrentUpdates(handlers: {
	onData: (torrents: QbittorentTorrent[]) => void;
	onError: (error: Error) => void;
}) {
	return getSubscriptionClient().qbittorent.listUpdates.subscribe(undefined, {
		onData: handlers.onData,
		onError: handlers.onError,
	});
}
