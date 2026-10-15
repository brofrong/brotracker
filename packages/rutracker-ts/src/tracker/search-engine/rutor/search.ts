import axios from "axios";
import { err, ok, type Result } from "neverthrow";
import type {
	SearchOptions,
	SearchPage,
	SearchResult,
} from "../../tracker-interface";
import { axiosAgentConfig } from "../rutracker/http";
import { categoriesFor } from "./categories";
import type { RutorOptions } from "./options";
import { parseResponse } from "./parse";
import { rutorSearchUrl } from "./search-url";

async function fetchSearchPage(
	url: string,
	options: RutorOptions,
): Promise<Result<string, Error>> {
	try {
		const response = await axios.get<string>(url, {
			responseType: "text",
			timeout: 30_000,
			validateStatus: () => true,
			...axiosAgentConfig(options.proxyAgent),
		});
		if (response.status >= 400) {
			return err(
				new Error(`Search request failed with HTTP ${response.status}`),
			);
		}
		return ok(response.data);
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		return err(new Error(`Failed to make search request: ${detail}`));
	}
}

/** Raw HTML of the first category's page (diagnostics / warm-up). */
export async function makeSearchRequest(
	query: string,
	queryOptions: Partial<SearchOptions>,
	options: RutorOptions,
): Promise<Result<string, Error>> {
	const [category] = categoriesFor(queryOptions.category);
	return fetchSearchPage(
		rutorSearchUrl(query, category ?? 0, queryOptions),
		options,
	);
}

export async function rutorSearch(
	query: string,
	queryOptions: Partial<SearchOptions>,
	options: RutorOptions,
): Promise<Result<SearchPage, Error>> {
	const categories = categoriesFor(queryOptions.category);
	const pages = await Promise.all(
		categories.map(async (category) => ({
			category,
			html: await fetchSearchPage(
				rutorSearchUrl(query, category, queryOptions),
				options,
			),
		})),
	);

	const failed = pages.find((page) => page.html.isErr());
	if (failed?.html.isErr() && pages.every((page) => page.html.isErr())) {
		return err(failed.html.error);
	}

	const seen = new Set<string>();
	const results: SearchResult[] = [];
	let totalResults = 0;
	for (const { category, html } of pages) {
		if (html.isErr()) continue;
		const page = parseResponse(html.value, String(category));
		if (page.isErr()) continue;
		totalResults += page.value.totalResults ?? 0;
		for (const result of page.value.results) {
			if (seen.has(result.torrentId)) continue;
			seen.add(result.torrentId);
			results.push(result);
		}
	}

	return ok({ results, totalResults });
}
