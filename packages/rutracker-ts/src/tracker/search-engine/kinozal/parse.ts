import { ok } from "neverthrow";
import parse, { type HTMLElement } from "node-html-parser";
import type { SearchPage, SearchResult } from "../../tracker-interface";
import { formatTorrentId } from "../../torrent-id";
import { resolveKinozalMirror } from "./hosts";
import { checkHDR, checkResolution, formatDate, formatSize } from "./format";

export function parseResponse(
	html: string,
	now = new Date(),
	baseUrl?: string,
) {
	const mirror = resolveKinozalMirror(baseUrl);
	const siteBase = `${mirror.url}/`;
	const root = parse(html);
	const rows = root.querySelectorAll("table.t_peer tr");
	const results: SearchResult[] = [];

	for (const row of rows) {
		const result = parseRow(row, now, mirror);
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
	const match = html.match(/Найдено\s+([\d\s]+)\s+раздач/i);
	if (!match?.[1]) {
		return null;
	}
	const value = Number.parseInt(match[1].replace(/\s+/g, ""), 10);
	return Number.isFinite(value) ? value : null;
}

function absoluteUrl(href: string, siteBase: string): string {
	try {
		return new URL(href, siteBase).href;
	} catch {
		return `${siteBase}${href.replace(/^\//, "")}`;
	}
}

function hrefParam(href: string, key: string, siteBase: string): string {
	try {
		return new URL(href, siteBase).searchParams.get(key) ?? "";
	} catch {
		return href.match(new RegExp(`[?&]${key}=(\\d+)`))?.[1] ?? "";
	}
}

function textNumber(el: HTMLElement | null): number {
	const value = Number.parseInt(el?.textContent?.trim() ?? "", 10);
	return Number.isFinite(value) ? value : 0;
}

function parseForumId(row: HTMLElement): string {
	const img = row.querySelector('td.bt img[onclick^="cat("]');
	const onclick = img?.getAttribute("onclick") ?? "";
	const fromOnclick = onclick.match(/cat\((\d+)\)/)?.[1];
	if (fromOnclick) {
		return fromOnclick;
	}

	const src = img?.getAttribute("src") ?? "";
	return src.match(/\/pic\/cat\/(\d+)\.gif/i)?.[1] ?? "";
}

function parseRow(
	row: HTMLElement,
	now: Date,
	mirror: ReturnType<typeof resolveKinozalMirror>,
): SearchResult | null {
	if (row.classList.contains("mn")) {
		return null;
	}

	const siteBase = `${mirror.url}/`;
	const titleLink = row.querySelector('a[href*="details.php?id="]');
	const title = titleLink?.textContent?.trim() ?? "";
	const topicHref = titleLink?.getAttribute("href")?.trim() ?? "";
	const rawTorrentId = hrefParam(topicHref, "id", siteBase);

	if (!rawTorrentId || !title) {
		return null;
	}

	const torrentId = formatTorrentId("kinozal", rawTorrentId);
	const forumId = parseForumId(row);
	const authorLink = row.querySelector('a[href*="userdetails.php?id="]');
	const authorId = hrefParam(
		authorLink?.getAttribute("href") ?? "",
		"id",
		siteBase,
	);

	const seedsCell = row.querySelector("td.sl_s");
	const leechesCell = row.querySelector("td.sl_p");
	const sizeCell = seedsCell?.previousElementSibling ?? null;
	const dateCell = leechesCell?.nextElementSibling ?? null;

	return {
		torrentId,
		forumId,
		category: forumId,
		title,
		authorId,
		size: formatSize(sizeCell?.textContent?.trim() ?? ""),
		seeds: textNumber(seedsCell),
		leeches: textNumber(leechesCell),
		downloads: 0,
		date: formatDate(dateCell?.textContent?.trim() ?? "", now),
		torrentFileUrl: `${mirror.dlUrl}/download.php?id=${rawTorrentId}`,
		topicUrl: absoluteUrl(
			topicHref || `/details.php?id=${rawTorrentId}`,
			siteBase,
		),
		hdr: checkHDR(title),
		resolution: checkResolution(title),
	};
}
