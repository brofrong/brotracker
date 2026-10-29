import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import axios from "axios";
import iconv from "iconv-lite";

import { rutrackerGetTorrent } from "../../src/tracker/search-engine/rutracker/get-torrent";
import { isRutrackerLoggedOutPage } from "../../src/tracker/search-engine/rutracker/login";
import { rutrackerSearch } from "../../src/tracker/search-engine/rutracker/search";
import { createFileStore } from "../../src/tracker/storage/file-store";
import type { RutrackerOptions } from "../../src/tracker/tracker-interface";

const htmlDir = join(import.meta.dir, "../fixtures/html");

const LOGGED_OUT_PAGE = `<html><body>
<a href="login.php">Вход</a>
<form action="https://rutracker.org/forum/login.php" method="post">
<input type="text" name="login_username"><input type="password" name="login_password">
</form></body></html>`;

const FAR_FUTURE = Math.floor(Date.now() / 1000) + 3600;

function htmlResponse(html: string) {
	return {
		status: 200,
		headers: {},
		data: iconv.encode(html, "windows-1251"),
	};
}

async function optionsWithStaleSession(): Promise<RutrackerOptions> {
	const dir = mkdtempSync(join(tmpdir(), "rutracker-session-"));
	const fileStore = createFileStore(join(dir, "store.json"));
	await fileStore.write({
		cfClearance: { name: "cf_clearance", value: "cf", expires: FAR_FUTURE },
		sessionCookies: [
			{ name: "bb_session", value: "0-1-stale", expires: FAR_FUTURE },
		],
		userAgent: "test-agent",
		updatedAt: null,
	});
	return {
		auth: { login: "user", password: "secret" },
		fileStore,
		proxyAgent: null,
	};
}

afterEach(() => {
	(axios.get as unknown as { mockRestore?: () => void }).mockRestore?.();
	(axios.post as unknown as { mockRestore?: () => void }).mockRestore?.();
});

describe("isRutrackerLoggedOutPage", () => {
	test("detects the login form RuTracker serves to a rejected session", () => {
		expect(isRutrackerLoggedOutPage(LOGGED_OUT_PAGE)).toBe(true);
	});

	test("treats a logged-in search page as logged in", async () => {
		const html = await Bun.file(join(htmlDir, "Джентльмены.html")).text();
		expect(isRutrackerLoggedOutPage(html)).toBe(false);
	});
});

describe("rutrackerSearch with a rejected session", () => {
	test("logs in again and returns results", async () => {
		const resultsPage = await Bun.file(
			join(htmlDir, "Джентльмены.html"),
		).text();
		const sentCookies: string[] = [];
		spyOn(axios, "get").mockImplementation((async (
			_url: string,
			config?: { headers?: Record<string, string> },
		) => {
			const cookie = config?.headers?.Cookie ?? "";
			sentCookies.push(cookie);
			return htmlResponse(
				cookie.includes("bb_session=0-1-fresh") ? resultsPage : LOGGED_OUT_PAGE,
			);
		}) as never);
		const post = spyOn(axios, "post").mockImplementation((async () => ({
			status: 200,
			headers: {
				"set-cookie": [
					"bb_ssl=1; path=/; domain=.rutracker.org",
					"bb_session=0-1-fresh; path=/; domain=.rutracker.org",
				],
			},
			data: "",
		})) as never);

		const result = await rutrackerSearch(
			"Джентльмены",
			{},
			await optionsWithStaleSession(),
		);

		expect(post).toHaveBeenCalledTimes(1);
		expect(sentCookies).toHaveLength(2);
		expect(result.isOk()).toBe(true);
		if (result.isOk()) {
			expect(result.value.results.length).toBeGreaterThan(0);
		}
	});

	test("fails loudly instead of returning zero results when login is rejected", async () => {
		spyOn(axios, "get").mockImplementation((async () =>
			htmlResponse(LOGGED_OUT_PAGE)) as never);
		spyOn(axios, "post").mockImplementation((async () => ({
			status: 200,
			headers: { "set-cookie": ["bb_ssl=1; path=/; domain=.rutracker.org"] },
			data: "",
		})) as never);

		const result = await rutrackerSearch(
			"Джентльмены",
			{},
			await optionsWithStaleSession(),
		);

		expect(result.isErr()).toBe(true);
		if (result.isErr()) {
			expect(result.error.message).toContain("Login failed");
		}
	});
});

describe("rutrackerGetTorrent with a rejected session", () => {
	test("logs in again and downloads the torrent", async () => {
		const torrent = new TextEncoder().encode("d8:announce0:e");
		spyOn(axios, "get").mockImplementation((async (
			_url: string,
			config?: { headers?: Record<string, string> },
		) =>
			config?.headers?.Cookie?.includes("bb_session=0-1-fresh")
				? { status: 200, headers: {}, data: torrent }
				: htmlResponse(LOGGED_OUT_PAGE)) as never);
		spyOn(axios, "post").mockImplementation((async () => ({
			status: 200,
			headers: {
				"set-cookie": ["bb_session=0-1-fresh; path=/; domain=.rutracker.org"],
			},
			data: "",
		})) as never);

		const result = await rutrackerGetTorrent(
			"https://rutracker.org/forum/dl.php?t=1",
			await optionsWithStaleSession(),
		);

		expect(result.isOk()).toBe(true);
	});
});

describe("concurrent requests with a rejected session", () => {
	test("log in only once", async () => {
		const resultsPage = await Bun.file(
			join(htmlDir, "Джентльмены.html"),
		).text();
		spyOn(axios, "get").mockImplementation((async (
			_url: string,
			config?: { headers?: Record<string, string> },
		) =>
			htmlResponse(
				config?.headers?.Cookie?.includes("bb_session=0-1-fresh")
					? resultsPage
					: LOGGED_OUT_PAGE,
			)) as never);
		const post = spyOn(axios, "post").mockImplementation((async () => {
			await Bun.sleep(5);
			return {
				status: 200,
				headers: {
					"set-cookie": ["bb_session=0-1-fresh; path=/; domain=.rutracker.org"],
				},
				data: "",
			};
		}) as never);

		const options = await optionsWithStaleSession();
		const results = await Promise.all([
			rutrackerSearch("Джентльмены", {}, options),
			rutrackerSearch("Джентльмены", {}, options),
			rutrackerSearch("Джентльмены", {}, options),
		]);

		expect(results.every((r) => r.isOk())).toBe(true);
		expect(post).toHaveBeenCalledTimes(1);
	});
});
