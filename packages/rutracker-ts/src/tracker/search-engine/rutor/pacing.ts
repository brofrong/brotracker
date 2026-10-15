/**
 * RuTor answers 503 for a while after a burst of ~6 simultaneous requests,
 * while requests started a few hundred ms apart are fine. Every RuTor request
 * in the process (searches, warm-up, covers, downloads) goes through here.
 */
const MIN_GAP_MS = 300;

let nextStartAt = 0;

export async function paced<T>(request: () => Promise<T>): Promise<T> {
	const now = Date.now();
	const startAt = Math.max(now, nextStartAt);
	nextStartAt = startAt + MIN_GAP_MS;
	if (startAt > now) {
		await new Promise((resolve) => setTimeout(resolve, startAt - now));
	}
	return request();
}
