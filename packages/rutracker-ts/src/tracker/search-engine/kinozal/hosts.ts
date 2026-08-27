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
		KINOZAL_MIRRORS.find((mirror) => normalizeBaseUrl(mirror.url) === normalized) ??
		DEFAULT_KINOZAL_MIRROR
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

/**
 * Allowlist for Kinozal torrent-file URLs across all mirrors:
 * https://dl.<mirror>/download.php?id=<digits>
 */
export function isKinozalDownloadUrl(torrentFileUrl: string): boolean {
	try {
		const url = new URL(torrentFileUrl);
		if (url.protocol !== "https:") return false;
		if (!isKinozalDlHostname(url.hostname)) return false;
		if (url.pathname !== "/download.php") return false;
		const id = url.searchParams.get("id");
		return Boolean(id && /^\d+$/.test(id));
	} catch {
		return false;
	}
}

export { KINOZAL_DL_URL };
