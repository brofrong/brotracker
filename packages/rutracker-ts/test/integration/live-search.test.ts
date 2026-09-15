import { expect, test } from "bun:test";
import { join } from "node:path";
import { createTracker } from "../../src/tracker/tracker";
import { createFileStore } from "../../src/tracker/storage/file-store";
import type {
	SearchOptions,
	SearchPage,
	SearchResult,
	TrackerInterface,
} from "../../src/tracker/tracker-interface";

const username = process.env.username;
const password = process.env.password;
const hasCredentials = Boolean(username && password);

/** Same options Catalog search sends from the UI (no category filter). */
const catalogSearchOptions: Partial<SearchOptions> = {
	sortType: "leechesCount",
	sortOrder: "descending",
};

function expectPlausibleResult(result: SearchResult) {
	expect(result.torrentId).toMatch(/^rutracker:\d+$/);
	expect(result.forumId).toMatch(/^\d+$/);
	expect(result.category.length).toBeGreaterThan(0);
	expect(result.title.length).toBeGreaterThan(10);
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

function requireCredentials(): { login: string; password: string } {
	if (!username || !password) {
		throw new Error("RuTracker credentials missing");
	}
	return { login: username, password };
}

async function createLiveTracker(): Promise<TrackerInterface> {
	const auth = requireCredentials();
	return createTracker("Rutracker", {
		auth,
		fileStore: createFileStore(
			join(import.meta.dir, "../../.data/rutracker-store.json"),
		),
		proxyAgent: null,
		cfSolverUrl: process.env.BYPARR_URL ?? "http://localhost:8191/v1",
	});
}

async function searchOrThrow(
	tracker: TrackerInterface,
	query: string,
	options: Partial<SearchOptions> = catalogSearchOptions,
) {
	const page = await tracker.search(query, options);
	if (!page.isOk()) {
		throw new Error(
			`RuTracker search for "${query}" failed: ${page.error.message}`,
			{ cause: page.error },
		);
	}
	return page.value;
}

function expectHitsForQuery(page: SearchPage, query: string) {
	const total = page.totalResults;
	expect(total, `totalResults for "${query}"`).not.toBeNull();
	expect(total ?? 0).toBeGreaterThan(0);
	expect(page.results.length, `parsed rows for "${query}"`).toBeGreaterThan(0);

	for (const row of page.results) {
		expectPlausibleResult(row);
	}

	const needle = query.toLowerCase();
	const matching = page.results.filter((row) =>
		row.title.toLowerCase().includes(needle),
	);
	expect(
		matching.length,
		`rows whose title contains "${query}" (got ${page.results
			.slice(0, 5)
			.map((r) => r.title)
			.join(" | ")})`,
	).toBeGreaterThan(0);

	return matching[0] ?? page.results[0];
}

(hasCredentials ? test : test.skip)(
	"live search: popular film Интерстеллар returns torrent rows",
	async () => {
		const tracker = await createLiveTracker();
		const query = "Интерстеллар";
		const page = await searchOrThrow(tracker, query);
		const first = expectHitsForQuery(page, query);
		if (!first) {
			throw new Error(`No parsed rows for "${query}"`);
		}
		const rawId = first.torrentId.split(":")[1];
		expect(first.torrentFileUrl).toContain(rawId);
		expect(first.topicUrl).toContain(rawId);
	},
	{ timeout: 180_000 },
);

(hasCredentials ? test : test.skip)(
	"live search: popular series Во все тяжкие returns torrent rows",
	async () => {
		const tracker = await createLiveTracker();
		const query = "Во все тяжкие";
		const page = await searchOrThrow(tracker, query);
		expectHitsForQuery(page, query);
	},
	{ timeout: 180_000 },
);
