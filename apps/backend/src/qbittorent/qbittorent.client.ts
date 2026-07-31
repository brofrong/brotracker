import { basename } from "node:path";
import { loadQbittorrentConfig } from "../settings/qbittorrent-config";
import type { AddTorrentOptions, QbittorentTorrent } from "./qbittorent.types";

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
	torrentFileOrMagnetLinkOrBytes: string | Uint8Array,
	options: AddTorrentOptions,
): Promise<void> {
	const formData = new FormData();
	formData.append("savepath", options.pathToSave);

	if (torrentFileOrMagnetLinkOrBytes instanceof Uint8Array) {
		const bytes = Buffer.from(torrentFileOrMagnetLinkOrBytes);
		const blob = new Blob([bytes], {
			type: "application/x-bittorrent",
		});
		formData.append(
			"torrents",
			blob,
			options.filename ?? "download.torrent",
		);
	} else if (isTorrentUrl(torrentFileOrMagnetLinkOrBytes)) {
		formData.append("urls", torrentFileOrMagnetLinkOrBytes);
	} else {
		const torrentFile = Bun.file(torrentFileOrMagnetLinkOrBytes);
		if (!(await torrentFile.exists())) {
			throw new Error(
				`Torrent source must be a magnet/URL, raw .torrent bytes, or an existing .torrent file path: ${torrentFileOrMagnetLinkOrBytes}`,
			);
		}

		formData.append(
			"torrents",
			torrentFile,
			options.filename ?? basename(torrentFileOrMagnetLinkOrBytes),
		);
	}

	await qbittorentRequest("/torrents/add", {
		method: "POST",
		body: formData,
	});
}
