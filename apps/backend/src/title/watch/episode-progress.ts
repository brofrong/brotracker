export type EpisodeProgress = {
	have: number;
	total: number;
};

/** Matches ru-tracker "N из M" / "A-N из M" progress markers, e.g. `1-8 из 10`, `08 из 12`. */
const PROGRESS_PATTERN = /(\d+)(?:\s*-\s*(\d+))?\s*из\s*(\d+)/iu;

/**
 * Parses "how many episodes have aired out of the season total" from a
 * ru-tracker torrent/topic name. Unknown or malformed names return null;
 * this must never throw so callers can treat parsing as best-effort.
 */
export function parseEpisodeProgress(torrentName: string): EpisodeProgress | null {
	const match = PROGRESS_PATTERN.exec(torrentName);
	if (!match) {
		return null;
	}

	const [, first, rangeEnd, totalRaw] = match;
	const have = Number(rangeEnd ?? first);
	const total = Number(totalRaw);

	if (!Number.isFinite(have) || !Number.isFinite(total) || total <= 0 || have < 0) {
		return null;
	}

	return { have, total };
}

/** True iff the name parses and every episode of the season is already present. */
export function isCompletePack(torrentName: string): boolean {
	const progress = parseEpisodeProgress(torrentName);
	return progress !== null && progress.have === progress.total;
}
