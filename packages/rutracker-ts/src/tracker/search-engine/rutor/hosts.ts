import {
	RUTOR_DL_HOSTNAMES,
	RUTOR_DL_URL,
	RUTOR_HOSTNAMES,
	RUTOR_URL,
} from "./constants";

function parseUrl(value: string): URL | null {
	try {
		return new URL(value);
	} catch {
		return null;
	}
}

export function isRutorSiteHostname(hostname: string): boolean {
	return (RUTOR_HOSTNAMES as readonly string[]).includes(
		hostname.toLowerCase(),
	);
}

/** Raw id from `https://d.rutor.info/download/<id>`. */
export function rutorDownloadId(torrentFileUrl: string): string | null {
	const url = parseUrl(torrentFileUrl);
	if (!url || url.protocol !== "https:") return null;
	if (!(RUTOR_DL_HOSTNAMES as readonly string[]).includes(url.hostname)) {
		return null;
	}
	return url.pathname.match(/^\/download\/(\d+)$/)?.[1] ?? null;
}

export function isRutorDownloadUrl(torrentFileUrl: string): boolean {
	return rutorDownloadId(torrentFileUrl) !== null;
}

/** Raw id from `https://rutor.info/torrent/<id>[/slug]`. */
export function rutorTopicId(topicUrl: string): string | null {
	const url = parseUrl(topicUrl);
	if (!url || !isRutorSiteHostname(url.hostname)) return null;
	return url.pathname.match(/^\/torrent\/(\d+)(?:\/|$)/)?.[1] ?? null;
}

export function rutorDownloadUrl(rawId: string): string {
	return `${RUTOR_DL_URL}/download/${rawId}`;
}

export function rutorTopicUrl(rawId: string): string {
	return `${RUTOR_URL}/torrent/${rawId}`;
}
