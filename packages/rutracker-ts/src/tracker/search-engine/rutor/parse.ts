import { ok, type Result } from "neverthrow";
import parse, { type HTMLElement } from "node-html-parser";

import { formatTorrentId } from "../../torrent-id";
import type { SearchPage, SearchResult } from "../../tracker-interface";
import { RUTOR_URL } from "./constants";
import { checkHDR, checkResolution, formatDate, formatSize } from "./format";
import { rutorDownloadUrl } from "./hosts";

/** Parse one rutor.info search page; `category` tags every row (see categories.ts). */
export function parseResponse(
	html: string,
	category = "",
): Result<SearchPage, Error> {
	const root = parse(html);
	const rows = root.querySelectorAll("#index tr.gai, #index tr.tum");
	const results: SearchResult[] = [];

	for (const row of rows) {
		const result = parseRow(row, category);
		if (result) {
			results.push(result);
		}
	}

	return ok({ results, totalResults: parseTotalResults(html) });
}

function parseTotalResults(html: string): number | null {
	const match = html.match(/Результатов поиска\s+(\d+)/);
	if (!match?.[1]) {
		return null;
	}
	const value = Number.parseInt(match[1], 10);
	return Number.isFinite(value) ? value : null;
}

function textNumber(el: HTMLElement | null): number {
	const value = Number.parseInt(
		el?.textContent?.replace(/ /g, " ").trim() ?? "",
		10,
	);
	return Number.isFinite(value) ? value : 0;
}

function parseRow(row: HTMLElement, category: string): SearchResult | null {
	const titleLink = row.querySelector('a[href^="/torrent/"]');
	const href = titleLink?.getAttribute("href") ?? "";
	const rawId = href.match(/^\/torrent\/(\d+)/)?.[1];
	const title = titleLink?.textContent?.trim() ?? "";
	if (!rawId || !title) {
		return null;
	}

	const cells = row.querySelectorAll("td");
	const dateCell = cells[0] ?? null;
	// Rows with comments have an extra column; size is always second to last.
	const sizeCell = cells[cells.length - 2] ?? null;

	return {
		torrentId: formatTorrentId("rutor", rawId),
		forumId: category,
		category,
		title,
		authorId: "",
		size: formatSize(sizeCell?.textContent ?? ""),
		seeds: textNumber(row.querySelector("span.green")),
		leeches: textNumber(row.querySelector("span.red")),
		downloads: 0,
		date: formatDate(dateCell?.textContent ?? ""),
		torrentFileUrl: rutorDownloadUrl(rawId),
		topicUrl: new URL(href, RUTOR_URL).href,
		hdr: checkHDR(title),
		resolution: checkResolution(title),
	};
}
