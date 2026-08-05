import { ok } from "neverthrow";
import parse, { type HTMLElement } from "node-html-parser";
import type { SearchPage, SearchResult } from "../../tracker-interface";
import { formatTorrentId } from "../../torrent-id";
import { checkHDR, checkResolution, formatDate, formatSize } from "./format";
import { RUTRACKER_URL } from "./constants";

const FORUM_BASE = `${RUTRACKER_URL}/forum/`;

export function parseResponse(html: string) {
	const root = parse(html);
	const rows = root.querySelectorAll(
		"#search-results #tor-tbl tbody tr[data-topic_id]",
	);
	const results: SearchResult[] = [];

	for (const row of rows) {
		const result = parseRow(row);
		if (result) {
			results.push(result);
		}
	}

	return ok({
		results,
		totalResults: parseTotalResults(html),
	} satisfies SearchPage);
}

function parseTotalResults(html: string): number | null {
	const match = html.match(/Результатов поиска:\s*([\d\s]+)/i);
	if (!match?.[1]) {
		return null;
	}
	const value = Number.parseInt(match[1].replace(/\s+/g, ""), 10);
	return Number.isFinite(value) ? value : null;
}

function absoluteForumUrl(href: string): string {
	try {
		return new URL(href, FORUM_BASE).href;
	} catch {
		return `${FORUM_BASE}${href.replace(/^\//, "")}`;
	}
}

function hrefParam(href: string, key: string): string {
	try {
		return new URL(href, FORUM_BASE).searchParams.get(key) ?? "";
	} catch {
		return href.match(new RegExp(`[?&]${key}=(-?\\d+)`))?.[1] ?? "";
	}
}

function attrNumber(el: HTMLElement | null, attr = "data-ts_text"): number | null {
	const raw = el?.getAttribute(attr);
	if (!raw) return null;
	const value = Number.parseInt(raw, 10);
	return Number.isFinite(value) ? value : null;
}

function textNumber(el: HTMLElement | null): number {
	const value = Number.parseInt(el?.textContent?.trim() ?? "", 10);
	return Number.isFinite(value) ? value : 0;
}

function findCell(
	cells: HTMLElement[],
	predicate: (cell: HTMLElement) => boolean,
): HTMLElement | null {
	return cells.find(predicate) ?? null;
}

function parseSize(sizeCell: HTMLElement | null): number {
	const exact = attrNumber(sizeCell);
	if (exact != null && exact > 0) {
		return exact;
	}
	return formatSize(sizeCell?.textContent?.trim() ?? "");
}

function parseDate(dateCell: HTMLElement | null): Date {
	const unix = attrNumber(dateCell);
	if (unix != null && unix > 0) {
		return new Date(unix * 1000);
	}
	return formatDate(dateCell?.textContent?.trim() ?? "");
}

function parseRow(row: HTMLElement): SearchResult | null {
	const titleLink = row.querySelector("a.tLink");
	const title = titleLink?.textContent?.trim() ?? "";
	const rawTorrentId =
		row.getAttribute("data-topic_id")?.trim() ||
		titleLink?.getAttribute("data-topic_id")?.trim() ||
		"";

	if (!rawTorrentId || !title) {
		return null;
	}
	const torrentId = formatTorrentId("rutracker", rawTorrentId);

	const cells = [...row.querySelectorAll("td")];
	const forumLink = row.querySelector("td.f-name-col a");
	const authorLink = row.querySelector("td.u-name-col a");
	const sizeCell =
		findCell(cells, (td) => td.classList.contains("tor-size")) ??
		row.querySelector("td.tor-size");
	const seedsCell = findCell(cells, (td) => Boolean(td.querySelector(".seedmed")));
	const leechesCell =
		findCell(cells, (td) => td.classList.contains("leechmed")) ??
		findCell(cells, (td) => td.getAttribute("title") === "Личи");
	const downloadsCell = findCell(cells, (td) =>
		td.classList.contains("number-format"),
	);
	// Date is the last cell with data-ts_text that isn't size/seeds.
	const dateCell =
		findCell(cells, (td) => {
			if (!td.getAttribute("data-ts_text")) return false;
			if (td.classList.contains("tor-size")) return false;
			if (td.querySelector(".seedmed")) return false;
			return Boolean(td.querySelector("p")) || cells.indexOf(td) === cells.length - 1;
		}) ?? cells.at(-1) ?? null;

	const forumHref = forumLink?.getAttribute("href") ?? "";
	const authorHref = authorLink?.getAttribute("href") ?? "";
	const forumId = hrefParam(forumHref, "f");
	const category = forumLink?.textContent?.trim() || forumId;
	const authorId = hrefParam(authorHref, "pid");

	const dlHref =
		row.querySelector("a.tr-dl")?.getAttribute("href")?.trim() ||
		`dl.php?t=${rawTorrentId}`;
	const topicHref =
		titleLink?.getAttribute("href")?.trim() ||
		`viewtopic.php?t=${rawTorrentId}`;

	return {
		torrentId,
		forumId,
		category,
		title,
		authorId,
		size: parseSize(sizeCell),
		seeds: attrNumber(seedsCell) ?? textNumber(seedsCell),
		leeches: textNumber(leechesCell),
		downloads: textNumber(downloadsCell),
		date: parseDate(dateCell),
		torrentFileUrl: absoluteForumUrl(dlHref),
		topicUrl: absoluteForumUrl(topicHref),
		hdr: checkHDR(title),
		resolution: checkResolution(title),
	};
}
