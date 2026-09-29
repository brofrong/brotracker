import type { TrackerSource } from "@brotracker/rutracker-ts/tracker/torrent-id";

/** Coarse reason a tracker call failed; the UI maps each code to a hint. */
export type TrackerErrorCode =
	| "timeout"
	| "unreachable"
	| "proxy"
	| "solver"
	| "cloudflare"
	| "auth"
	| "http"
	| "unknown";

export type TrackerFailure = {
	source: TrackerSource;
	code: TrackerErrorCode;
	message: string;
};

/**
 * rutracker-ts returns plain `Error`s, so classify by message.
 * Order matters: the Cloudflare error mentions the solver, and solver
 * errors often wrap a timeout message.
 */
const MESSAGE_RULES: Array<[RegExp, TrackerErrorCode]> = [
	[/Cannot bypass Cloudflare/i, "cloudflare"],
	[/CF solver|cf_clearance via solver/i, "solver"],
	[/Login failed/i, "auth"],
	[/proxy|socks/i, "proxy"],
	[/timeout|timed out|ECONNABORTED|ETIMEDOUT/i, "timeout"],
	[
		/ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ECONNRESET|EHOSTUNREACH|ENETUNREACH|Unable to connect|ConnectionRefused/i,
		"unreachable",
	],
	[/HTTP \d{3}/, "http"],
];

export function classifyTrackerError(message: string): TrackerErrorCode {
	for (const [pattern, code] of MESSAGE_RULES) {
		if (pattern.test(message)) {
			return code;
		}
	}
	return "unknown";
}

/** Classify a thrown `fetch` error (Bun reports the reason in `name` / `code`). */
export function classifyNetworkError(error: unknown): TrackerErrorCode {
	if (error instanceof Error || error instanceof DOMException) {
		if (error.name === "TimeoutError") {
			return "timeout";
		}
		const code = (error as { code?: unknown }).code;
		return classifyTrackerError(
			typeof code === "string" ? `${code} ${error.message}` : error.message,
		);
	}
	return classifyTrackerError(String(error));
}

export function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
