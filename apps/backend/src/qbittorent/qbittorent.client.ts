import { basename } from "node:path";
import { env } from "../utils/env";
import type { QbittorentTorrent } from "./qbittorent.types";

const TORRENT_URL_PATTERN = /^(magnet:|https?:|bc:\/\/bt\/)/i;

function normalizeBaseUrl(url: string): string {
	return url.replace(/\/+$/, "");
}

function isTorrentUrl(value: string): boolean {
	return TORRENT_URL_PATTERN.test(value);
}

async function qbittorentRequest(
	path: string,
	init?: RequestInit,
): Promise<Response> {
	const url = `${normalizeBaseUrl(env.QBITTORRENT_URL)}/api/v2${path}`;
	const response = await fetch(url, {
		...init,
		headers: {
			Authorization: `Bearer ${env.QBITTORRENT_API_KEY}`,
			...init?.headers,
		},
	});

	if (!response.ok) {
		const body = await response.text();
		throw new Error(
			`qBittorrent API ${path} failed (${response.status}): ${body || response.statusText}`,
		);
	}

	return response;
}

export async function getTorrents(): Promise<QbittorentTorrent[]> {
	const response = await qbittorentRequest("/torrents/info");
	return response.json() as Promise<QbittorentTorrent[]>;
}

export async function addTorrent(
	torrentFileOrMagnetLink: string,
	options: { pathToSave: string },
): Promise<void> {
	const formData = new FormData();
	formData.append("savepath", options.pathToSave);

	if (isTorrentUrl(torrentFileOrMagnetLink)) {
		formData.append("urls", torrentFileOrMagnetLink);
	} else {
		const torrentFile = Bun.file(torrentFileOrMagnetLink);
		if (!(await torrentFile.exists())) {
			throw new Error(
				`Torrent source must be a magnet/URL or an existing .torrent file path: ${torrentFileOrMagnetLink}`,
			);
		}

		formData.append(
			"torrents",
			torrentFile,
			basename(torrentFileOrMagnetLink),
		);
	}

	await qbittorentRequest("/torrents/add", {
		method: "POST",
		body: formData,
	});
}
