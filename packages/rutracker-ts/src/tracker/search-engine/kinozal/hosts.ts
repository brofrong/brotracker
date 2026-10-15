import {
	DEFAULT_KINOZAL_MIRROR,
	KINOZAL_DL_URL,
	KINOZAL_MIRRORS,
	type KinozalMirror,
} from "./constants";

function normalizeBaseUrl(url: string): string {
	return url.replace(/\/+$/, "").toLowerCase();
}

/** Resolve the configured mirror; falls back to the default one. */
export function resolveKinozalMirror(baseUrl?: string | null): KinozalMirror {
	if (!baseUrl) {
		return DEFAULT_KINOZAL_MIRROR;
	}
	const normalized = normalizeBaseUrl(baseUrl);
	return (
		KINOZAL_MIRRORS.find(
			(mirror) => normalizeBaseUrl(mirror.url) === normalized,
		) ?? DEFAULT_KINOZAL_MIRROR
	);
}

function baseHostnames(): string[] {
	return KINOZAL_MIRRORS.map((mirror) => new URL(mirror.url).hostname);
}

/** Any official Kinozal site host or its subdomain (forum.kinozal.me, …). */
export function isKinozalSiteHostname(hostname: string): boolean {
	const host = hostname.toLowerCase();
	return baseHostnames().some(
		(base) => host === base || host.endsWith(`.${base}`),
	);
}

/** Any official Kinozal download host (dl.kinozal.me, …). */
export function isKinozalDlHostname(hostname: string): boolean {
	const host = hostname.toLowerCase();
	return KINOZAL_MIRRORS.some(
		(mirror) => new URL(mirror.dlUrl).hostname === host,
	);
}

function isKinozalBaseHostname(hostname: string): boolean {
	return baseHostnames().includes(hostname.toLowerCase());
}

function kinozalDownloadId(torrentFileUrl: string): string | null {
	try {
		const url = new URL(torrentFileUrl);
		if (url.protocol !== "https:") return null;
		if (
			!isKinozalBaseHostname(url.hostname) &&
			!isKinozalDlHostname(url.hostname)
		) {
			return null;
		}
		if (url.pathname !== "/download.php") return null;
		const id = url.searchParams.get("id");
		return id && /^\d+$/.test(id) ? id : null;
	} catch {
		return null;
	}
}

/**
 * Allowlist for Kinozal torrent-file URLs across all mirrors:
 * https://<mirror>/download.php?id=<digits>, plus legacy
 * https://dl.<mirror>/download.php?id=<digits> stored before the dl hosts broke.
 */
export function isKinozalDownloadUrl(torrentFileUrl: string): boolean {
	return kinozalDownloadId(torrentFileUrl) !== null;
}

/**
 * URL to actually fetch a torrent from: the configured mirror's site host.
 * dl.<mirror> answers Cloudflare 520, and the site links `/download.php` itself.
 * Returns null when the URL is not allowlisted.
 */
export function kinozalDownloadRequestUrl(
	torrentFileUrl: string,
	baseUrl?: string | null,
): string | null {
	const id = kinozalDownloadId(torrentFileUrl);
	if (!id) return null;
	return `${resolveKinozalMirror(baseUrl).url}/download.php?id=${id}`;
}

export { KINOZAL_DL_URL };
