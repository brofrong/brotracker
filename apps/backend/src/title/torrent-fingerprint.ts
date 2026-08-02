export type TorrentFingerprint = {
	size: number;
	registeredAt: string | null;
	contentHash: string | null;
};

/** Compare torrent fingerprints. Prefer content hash when both sides have it. */
export function fingerprintsEqual(
	left: TorrentFingerprint,
	right: TorrentFingerprint,
): boolean {
	if (left.contentHash && right.contentHash) {
		return left.contentHash === right.contentHash;
	}

	return (
		left.size === right.size && left.registeredAt === right.registeredAt
	);
}

/** SHA-256 hex digest of raw .torrent bytes. */
export async function hashTorrentBytes(bytes: Uint8Array): Promise<string> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		bytes.buffer.slice(
			bytes.byteOffset,
			bytes.byteOffset + bytes.byteLength,
		) as ArrayBuffer,
	);
	return Buffer.from(digest).toString("hex");
}
