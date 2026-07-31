import { expect, test } from "bun:test";
import { join } from "node:path";
import { createTracker } from "../../src/tracker/tracker";
import { createFileStore } from "../../src/tracker/storage/file-store";
import type { SearchResult } from "../../src/tracker/tracker-interface";

const username = process.env.username;
const password = process.env.password;
const hasCredentials = Boolean(username && password);

function expectPlausibleResult(result: SearchResult, query: string) {
	expect(result.torrentId).toMatch(/^\d+$/);
	expect(result.forumId).toMatch(/^\d+$/);
	expect(result.category.length).toBeGreaterThan(0);
	expect(result.title.length).toBeGreaterThan(10);
	expect(result.title.toLowerCase()).toContain(query.toLowerCase());
	expect(result.authorId).toMatch(/^-?\d+$/);
	expect(result.size).toBeGreaterThan(0);
	expect(result.torrentFileUrl).toMatch(
		/^https:\/\/rutracker\.org\/forum\/dl\.php\?t=\d+$/,
	);
	expect(result.topicUrl).toMatch(
		/^https:\/\/rutracker\.org\/forum\/viewtopic\.php\?t=\d+$/,
	);
	expect(result.seeds).toBeGreaterThanOrEqual(0);
	expect(result.leeches).toBeGreaterThanOrEqual(0);
	expect(result.downloads).toBeGreaterThanOrEqual(0);
	expect(result.date.getTime()).toBeGreaterThan(0);
	expect(["HDR", "SDR", null]).toContain(result.hdr);
	expect(["4K", "1080p", "720p", "SD", null]).toContain(result.resolution);
}

(hasCredentials ? test : test.skip)(
	"live search: login, search Интерстеллар, parser returns real rows",
	async () => {
		const tracker = await createTracker("Rutracker", {
			auth: {
				login: username!,
				password: password!,
			},
			fileStore: createFileStore(
				join(import.meta.dir, "../../.data/rutracker-store.json"),
			),
			proxyAgent: null,
			cfSolverUrl: process.env.BYPARR_URL ?? "http://localhost:8191/v1",
		});

		const query = "Интерстеллар";
		const page = await tracker.search(query, { category: "films" });

		if (!page.isOk()) {
			throw page.error;
		}

		expect(page.value.totalResults).not.toBeNull();
		expect(page.value.totalResults!).toBeGreaterThan(0);
		expect(page.value.results.length).toBeGreaterThan(0);

		for (const row of page.value.results) {
			expectPlausibleResult(row, "Интерстеллар");
		}

		const first = page.value.results[0]!;
		expect(first.torrentFileUrl).toContain(first.torrentId);
		expect(first.topicUrl).toContain(first.torrentId);
	},
	{ timeout: 180_000 },
);
