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

type MainDataServerState = {
	alltime_dl?: number;
	alltime_ul?: number;
	dl_info_data?: number;
	up_info_data?: number;
	dl_info_speed?: number;
	up_info_speed?: number;
	free_space_on_disk?: number;
};

type MainDataResponse = {
	server_state?: MainDataServerState;
};

async function fetchMainData(): Promise<MainDataResponse> {
	const response = await qbittorentRequest("/sync/maindata?rid=0");
	return response.json() as Promise<MainDataResponse>;
}

export type TransferStats = {
	downloadedBytes: number;
	uploadedBytes: number;
	downloadSpeed?: number;
	uploadSpeed?: number;
	freeSpaceBytes?: number;
	ratio?: number;
};

function parseTransferStats(state: MainDataServerState): TransferStats {
	const downloadedBytes = state.alltime_dl ?? state.dl_info_data ?? 0;
	const uploadedBytes = state.alltime_ul ?? state.up_info_data ?? 0;

	const stats: TransferStats = {
		downloadedBytes,
		uploadedBytes,
	};

	if (
		typeof state.dl_info_speed === "number" &&
		Number.isFinite(state.dl_info_speed)
	) {
		stats.downloadSpeed = state.dl_info_speed;
	}
	if (
		typeof state.up_info_speed === "number" &&
		Number.isFinite(state.up_info_speed)
	) {
		stats.uploadSpeed = state.up_info_speed;
	}
	if (
		typeof state.free_space_on_disk === "number" &&
		Number.isFinite(state.free_space_on_disk)
	) {
		stats.freeSpaceBytes = state.free_space_on_disk;
	}

	if (downloadedBytes > 0) {
		stats.ratio = uploadedBytes / downloadedBytes;
	}

	return stats;
}

/** Aggregate transfer stats from qBittorrent server state. */
export async function getTransferStats(): Promise<TransferStats> {
	const data = await fetchMainData();
	const state = data.server_state ?? {};
	return parseTransferStats(state);
}

/** Free space on qBittorrent's default save path (bytes). */
export async function getFreeSpaceOnDisk(): Promise<number | null> {
	const data = await fetchMainData();
	const free = data.server_state?.free_space_on_disk;
	return typeof free === "number" && Number.isFinite(free) ? free : null;
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
	if (options.tags && options.tags.length > 0) {
		formData.append("tags", options.tags.join(","));
	}

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

function torrentHashesBody(hash: string, extra?: Record<string, string>): string {
	const params = new URLSearchParams({ hashes: hash, ...extra });
	return params.toString();
}

/** Stop a torrent (download or seeding). qBittorrent 5+ uses /stop (was /pause). */
export async function pauseTorrent(hash: string): Promise<void> {
	await qbittorentRequest("/torrents/stop", {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: torrentHashesBody(hash),
	});
}

/** Start a stopped torrent. qBittorrent 5+ uses /start (was /resume). */
export async function resumeTorrent(hash: string): Promise<void> {
	await qbittorentRequest("/torrents/start", {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: torrentHashesBody(hash),
	});
}

/** Remove torrent and its downloaded files from qBittorrent. */
export async function deleteTorrent(hash: string): Promise<void> {
	await qbittorentRequest("/torrents/delete", {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: torrentHashesBody(hash, { deleteFiles: "true" }),
	});
}
