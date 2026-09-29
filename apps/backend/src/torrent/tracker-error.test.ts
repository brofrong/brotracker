import { describe, expect, test } from "bun:test";
import { classifyNetworkError, classifyTrackerError } from "./tracker-error";

describe("classifyTrackerError", () => {
	test.each([
		[
			"Failed to acquire cf_clearance via solver: AxiosError: timeout of 135000ms exceeded. Is Byparr running at the solver URL?",
			"solver",
		],
		["CF solver request failed: HTTP 500", "solver"],
		["CF solver timed out after 120s. Check Byparr logs / shm_size.", "solver"],
		[
			"Cannot bypass Cloudflare protection (search). cf_clearance refresh via CF solver failed.",
			"cloudflare",
		],
		["Login failed: no session cookies (HTTP 200)", "auth"],
		["Login failed: uid/pass cookies not returned", "auth"],
		["Login request failed: timeout of 30000ms exceeded", "timeout"],
		[
			"Failed to make search request (ECONNABORTED): timeout of 30000ms exceeded",
			"timeout",
		],
		["The operation timed out.", "timeout"],
		["connect ECONNREFUSED 127.0.0.1:443", "unreachable"],
		["getaddrinfo ENOTFOUND rutracker.org", "unreachable"],
		[
			"Unable to connect. Is the computer able to access the url?",
			"unreachable",
		],
		["Proxy connection ended before receiving CONNECT response", "proxy"],
		["Socks5 proxy rejected connection - Failure", "proxy"],
		["Search request failed with HTTP 502", "http"],
		["Failed to parse response: unexpected markup", "unknown"],
	] as const)("%s → %s", (message, code) => {
		expect(classifyTrackerError(message)).toBe(code);
	});
});

describe("classifyNetworkError", () => {
	test("abort timeout", () => {
		const error = new DOMException("The operation timed out.", "TimeoutError");
		expect(classifyNetworkError(error)).toBe("timeout");
	});

	test("bun fetch connection refused", () => {
		const error = Object.assign(
			new TypeError(
				"Unable to connect. Is the computer able to access the url?",
			),
			{ code: "ConnectionRefused" },
		);
		expect(classifyNetworkError(error)).toBe("unreachable");
	});

	test("dns failure", () => {
		const error = Object.assign(
			new TypeError("getaddrinfo ENOTFOUND nonexistent.invalid"),
			{ code: "ENOTFOUND" },
		);
		expect(classifyNetworkError(error)).toBe("unreachable");
	});

	test("non-error values fall back to message classification", () => {
		expect(classifyNetworkError("something odd")).toBe("unknown");
	});
});
