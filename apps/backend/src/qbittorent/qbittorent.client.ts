import { basename } from "node:path";
import { loadQbittorrentConfig } from "../settings/qbittorrent-config";
import type { QbittorentTorrent } from "./qbittorent.types";

const TORRENT_URL_PATTERN = /^(magnet:|https?:|bc:\/\/bt\/)/i;

export class QbittorrentNotConfiguredError extends Error {
	constructor() {
		super(
			"qBittorrent is not configured. Set URL and API key in Settings.",
		);
		this.name = "QbittorrentNotConfiguredError";
	}
}

function isTorrentUrl(value: string): boolean {
	return TORRENT_URL_PATTERN.test(value);
}

async function qbittorentRequest(
	path: string,
	init?: RequestInit,
): Promise<Response> {
	const config = await loadQbittorrentConfig();
	if (!config) {
		throw new QbittorrentNotConfiguredError();
	}

	const url = `${config.url}/api/v2${path}`;
	const response = await fetch(url, {
		...init,
		headers: {
			Authorization: `Bearer ${config.apiKey}`,
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

/** Lightweight auth check: app version endpoint. */
export async function testQbittorrentConnection(): Promise<{
	ok: true;
	version: string;
	torrentCount: number;
}> {
	const versionResponse = await qbittorentRequest("/app/version");
	const version = (await versionResponse.text()).trim();
	const torrents = await getTorrents();
	return { ok: true, version, torrentCount: torrents.length };
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
