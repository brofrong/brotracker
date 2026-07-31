export type QualityInput = {
	seeds: number;
	size: number;
	hdr: "HDR" | "SDR" | null;
	resolution: "4K" | "1080p" | "720p" | "SD" | null;
};

const RESOLUTION_SCORE: Record<
	NonNullable<QualityInput["resolution"]>,
	number
> = {
	"4K": 100,
	"1080p": 55,
	"720p": 25,
	SD: 5,
};

const GB = 1e9;

/** Seeds: steep gains up to ~6, then slow log growth so 400 still beats 300. */
export function scoreSeeds(seeds: number): number {
	const safe = Math.max(0, seeds);
	return 40 * (1 - Math.exp(-safe / 4)) + 2 * Math.log1p(safe);
}

export function scoreResolution(
	resolution: QualityInput["resolution"],
): number {
	if (!resolution) return 0;
	return RESOLUTION_SCORE[resolution];
}

export function scoreHdr(hdr: QualityInput["hdr"]): number {
	return hdr === "HDR" ? 35 : 0;
}

/** Smaller file is slightly better when other factors match. */
export function scoreSize(sizeBytes: number): number {
	const safe = Math.max(1, sizeBytes);
	return -10 * Math.log10(safe / GB);
}

export function scoreTorrentQuality(input: QualityInput): number {
	return (
		scoreSeeds(input.seeds) +
		scoreResolution(input.resolution) +
		scoreHdr(input.hdr) +
		scoreSize(input.size)
	);
}

export function compareTorrentQuality(
	a: QualityInput & { similarity?: number },
	b: QualityInput & { similarity?: number },
): number {
	const qualityDiff =
		scoreTorrentQuality(b) - scoreTorrentQuality(a);
	if (qualityDiff !== 0) return qualityDiff;
	return (b.similarity ?? 0) - (a.similarity ?? 0);
}
