import EventEmitter, { on } from "node:events";
import { getTorrents } from "./qbittorent.client";
import type { QbittorentTorrent } from "./qbittorent.types";

const POLL_INTERVAL_MS = 2000;

export const torrentUpdateEvents = new EventEmitter();

let subscriberCount = 0;
let pollInterval: ReturnType<typeof setInterval> | null = null;

async function pollTorrents() {
	try {
		const torrents = await getTorrents();
		torrentUpdateEvents.emit("update", torrents);
	} catch (error) {
		torrentUpdateEvents.emit(
			"error",
			error instanceof Error ? error : new Error(String(error)),
		);
	}
}

function startPolling() {
	void pollTorrents();
	pollInterval = setInterval(() => {
		void pollTorrents();
	}, POLL_INTERVAL_MS);
}

function stopPolling() {
	if (pollInterval) {
		clearInterval(pollInterval);
		pollInterval = null;
	}
}

export function subscribeToTorrentUpdates(): () => void {
	subscriberCount += 1;
	if (subscriberCount === 1) {
		startPolling();
	}

	return () => {
		subscriberCount -= 1;
		if (subscriberCount === 0) {
			stopPolling();
		}
	};
}

export async function* iterateTorrentUpdates(
	signal: AbortSignal | undefined,
): AsyncGenerator<QbittorentTorrent[]> {
	const unsubscribe = subscribeToTorrentUpdates();

	try {
		const iterable = on(torrentUpdateEvents, "update", { signal });
		for await (const [torrents] of iterable) {
			yield torrents as QbittorentTorrent[];
		}
	} finally {
		unsubscribe();
	}
}
