import axios, { type AxiosResponse } from "axios";
import iconv from "iconv-lite";
import { err, ok, Result } from "neverthrow";
import parse, { HTMLElement } from "node-html-parser";
import type {
	RutrackerOptions,
	SearchOptions,
	SearchResult,
} from "../../tracker-interface";
import { RUTRACKER_URL } from "./rutracker";
import { rutrackerGetCookies } from "./rutracker-login";
import { createSearchOptions } from "./rutracker-search-options";

export async function rutrackerSearch(
	query: string,
	queryOptions: Partial<SearchOptions>,
	options: RutrackerOptions,
): Promise<Result<SearchResult[], Error>> {
	const cookies = await rutrackerGetCookies(
		options.auth.login,
		options.auth.password,
		options.store,
	);
	if (!cookies.isOk()) {
		return err(new Error("Failed to get cookies"));
	}
	const cookiesString = cookies.value.cookies;

	const searchOptions = createSearchOptions(query, queryOptions);

	const response = await axios.get(`${RUTRACKER_URL}/forum/tracker.php`, {
		params: searchOptions,
		responseType: "arraybuffer",
		headers: {
			Cookie: cookiesString,
		},
	});

	const results = parseResponse(response);
	if (results.isErr()) {
		return err(new Error("Failed to parse response"));
	}
	return ok(results.value);
}

function parseResponse(response: AxiosResponse) {
	const root = parse(iconv.decode(response.data, "windows-1251"));

	const rows = root.querySelectorAll("#search-results table tbody tr");
	if (!rows) {
		return err(new Error("No rows found"));
	}
	const results: SearchResult[] = [];
	for (const row of rows ?? []) {
		const result = parseRow(row);
		if (result.isErr()) {
			return err(result.error);
		}
		results.push(result.value);
	}
	return ok(results);
}

type ParsedCell = {
	selector: string;
	type: "string" | "date" | "url" | "number";
};

const cells: Record<keyof SearchResult, ParsedCell> = {
	torrentId: {
		selector: "td:nth-child(3)",
		type: "string",
	},
	category: {
		selector: "td:nth-child(3)",
		type: "string",
	},
	title: {
		selector: "td:nth-child(4)",
		type: "string",
	},
	author: {
		selector: "td:nth-child(5)",
		type: "string",
	},
	size: {
		selector: "td:nth-child(6)",
		type: "string",
	},
	torrentFileUrl: {
		selector: "td:nth-child(6) a",
		type: "url",
	},
	seeds: {
		selector: "td:nth-child(7)",
		type: "number",
	},
	leeches: {
		selector: "td:nth-child(8)",
		type: "number",
	},
	downloads: {
		selector: "td:nth-child(9)",
		type: "number",
	},
	date: {
		selector: "td:nth-child(10)",
		type: "date",
	},
};

function parseCell(cell: HTMLElement, options: ParsedCell) {
	let value: string | undefined;
	if (options.type === "url") {
		value = cell.querySelector(options.selector)?.getAttribute("href")?.trim();
	} else if (options.type === "string") {
		value = cell.querySelector(options.selector)?.textContent?.trim();
	} else if (options.type === "date") {
		value = cell.querySelector(options.selector)?.textContent?.trim();
	} else if (options.type === "number") {
		value = cell.querySelector(options.selector)?.textContent?.trim();
	}
	// if (!value) {
	// 	return err(`No data found in cell ${options.selector}`);
	// }
	return ok(value);
}

function parseRow(row: HTMLElement) {
	// const cells = row.querySelectorAll("td");
	const parsedRow: Partial<SearchResult> = {};

	for (const [key, value] of Object.entries(cells)) {
		const data = parseCell(row, value);

		if (data.isErr()) {
			return err(data.error);
		}

		if (value.type === "number") {
			// @ts-expect-error - key is a valid key of SearchResult
			parsedRow[key] = data.value;
		} else {
			// @ts-expect-error - key is a valid key of SearchResult
			parsedRow[key] = data.value;
		}
	}

	return ok(parsedRow as SearchResult);
}
