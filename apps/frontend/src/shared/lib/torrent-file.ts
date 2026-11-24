/** Characters Windows, macOS and Linux refuse in file names. */
const FORBIDDEN = /[<>:"/\\|?*]/g;
const MAX_NAME_LENGTH = 180;

function stripControlChars(value: string): string {
	return Array.from(value)
		.filter((char) => char.charCodeAt(0) >= 0x20)
		.join("");
}

/** "Дюна / Dune (2021) WEB-DL 2160p" → "Дюна - Dune (2021) WEB-DL 2160p.torrent" */
export function torrentFileName(title: string): string {
	const base = stripControlChars(title)
		.replace(/\s*[/\\|]\s*/g, " - ")
		.replace(FORBIDDEN, "")
		.replace(/\s+/g, " ")
		.trim()
		.replace(/[. ]+$/, "")
		.slice(0, MAX_NAME_LENGTH)
		.trim();
	return `${base || "torrent"}.torrent`;
}

export function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

/** Hand the bytes to the browser as a download named `fileName`. */
export function saveTorrentFile(base64: string, fileName: string): void {
	const blob = new Blob([base64ToBytes(base64)], {
		type: "application/x-bittorrent",
	});
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = fileName;
	link.rel = "noopener";
	document.body.append(link);
	link.click();
	link.remove();
	// Revoke on the next tick: Safari cancels the download if revoked synchronously.
	setTimeout(() => URL.revokeObjectURL(url), 0);
}
