const RELEASE_MARKER =
	/\b(?:(?:19|20)\d{2}|S\d{1,2}(?:E\d{1,3})?|\d{3,4}p|WEB-?DL|WEB-?Rip|BD-?Rip|BluRay|HDRip|HDTV|REMUX|UHD|x26[45]|H\.?26[45]|HEVC|AVC)\b/i;

/**
 * Best-effort TMDB search query from a raw torrent name:
 * "Нюрнберг / Nuremberg (Джеймс …)" → "Нюрнберг",
 * "Padre.Pio.2022.WEB-DL.1080p" → "Padre Pio",
 * "[VLDeshka] Mushoku Tensei S3 [WEBRip 1080p]" → "Mushoku Tensei".
 */
export function guessTitleQuery(name: string): string {
	let text = name.replace(/\.[a-z0-9]{2,4}$/i, "");
	text = text.replace(/\[[^\]]*\]/g, " ");
	text = text.split(" / ")[0] ?? text;
	text = text.replace(/\([^)]*\)?/g, " ");
	text = text.replace(/[._]+/g, " ");

	const marker = RELEASE_MARKER.exec(text);
	if (marker && marker.index > 0) {
		text = text.slice(0, marker.index);
	}

	return text
		.replace(/\s+/g, " ")
		.replace(/[\s\-–:]+$/u, "")
		.trim();
}
