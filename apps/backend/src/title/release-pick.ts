import {
	type ParsedReleaseTitle,
	parseReleaseTitle,
} from "@brotracker/rutracker-ts/tracker/release-title";
import type { WatchlistSettings } from "../settings/watchlist-settings";
import { scoreTorrentQuality } from "../torrent/quality-score";
import { type MatchTarget, releaseNamesMatch } from "./release-match";
import type { TitleTorrentCandidate } from "./title.types";
import type { WaitingOutcome } from "./watch/check-topic-now";

export type PickTarget = MatchTarget & {
	season: number | null;
	/**
	 * tv: TMDB air year of the watched season (the year its releases carry);
	 * `null` when unknown. Ignored for films, which use `year`.
	 */
	seasonYear: number | null;
};

export type PickResult =
	| { status: "found"; candidate: TitleTorrentCandidate }
	| {
			status: "none";
			outcome: Exclude<WaitingOutcome, "search-failed">;
			detail: string | null;
	  };

type Resolution = TitleTorrentCandidate["resolution"];

const RESOLUTION_RANK: Record<NonNullable<Resolution>, number> = {
	"4K": 3,
	"1080p": 2,
	"720p": 1,
	SD: 0,
};

const MIN_RESOLUTION_RANK: Record<WatchlistSettings["minResolution"], number> =
	{
		"4K": 3,
		"1080p": 2,
		"720p": 1,
	};

/** A missing resolution ranks below every known resolution, including SD. */
function resolutionRank(resolution: Resolution): number {
	return resolution === null ? -1 : RESOLUTION_RANK[resolution];
}

/** Best resolution among a set of candidates; `null` when none report one. */
function bestResolution(candidates: TitleTorrentCandidate[]): Resolution {
	let best: Resolution = null;
	for (const candidate of candidates) {
		if (resolutionRank(candidate.resolution) > resolutionRank(best)) {
			best = candidate.resolution;
		}
	}
	return best;
}

function bestByQuality(
	candidates: TitleTorrentCandidate[],
): TitleTorrentCandidate {
	return candidates.reduce((best, candidate) => {
		const candidateScore = scoreTorrentQuality(candidate);
		const bestScore = scoreTorrentQuality(best);
		return candidateScore > bestScore ? candidate : best;
	});
}

type Scored = { candidate: TitleTorrentCandidate; parsed: ParsedReleaseTitle };

/**
 * Strict year rule for auto-download (stricter than the title page's
 * `releaseMatchesTitle`): the release year must be within one year of the
 * film's year / the watched season's air year, and an unknown year on either
 * side never matches — downloading the wrong film is worse than waiting.
 */
function yearFits(parsed: ParsedReleaseTitle, target: PickTarget): boolean {
	const anchor = target.kind === "films" ? target.year : target.seasonYear;
	if (parsed.year === null || anchor === null) return false;
	return Math.abs(parsed.year - anchor) <= 1;
}

function matchesTarget(
	parsed: ParsedReleaseTitle,
	target: PickTarget,
): boolean {
	if (!releaseNamesMatch(parsed, target.names)) return false;
	if (!yearFits(parsed, target)) return false;
	if (target.kind === "tv") {
		return target.season !== null && parsed.season === target.season;
	}
	return true;
}

/**
 * Picks the best release for a «Жду» watch, stage by stage: title/year/season
 * match, then not-camrip, then minimum resolution, then (optionally) HDR, then
 * (optionally) Russian voice. The outcome reported is the furthest stage that
 * emptied the surviving candidate set — not necessarily the first candidate's
 * failure reason.
 */
export function pickRelease(
	candidates: TitleTorrentCandidate[],
	target: PickTarget,
	rules: WatchlistSettings,
): PickResult {
	const parsedCandidates: Scored[] = candidates.map((candidate) => ({
		candidate,
		parsed: parseReleaseTitle(candidate.title),
	}));

	const matching = parsedCandidates.filter(({ parsed }) =>
		matchesTarget(parsed, target),
	);
	if (matching.length === 0) {
		return { status: "none", outcome: "no-releases", detail: null };
	}

	const notCamrip = matching.filter(({ parsed }) => !parsed.isCamrip);
	if (notCamrip.length === 0) {
		return { status: "none", outcome: "only-camrip", detail: null };
	}

	const minRank = MIN_RESOLUTION_RANK[rules.minResolution];
	const meetsResolution = notCamrip.filter(
		({ candidate }) => resolutionRank(candidate.resolution) >= minRank,
	);
	if (meetsResolution.length === 0) {
		const detail = bestResolution(notCamrip.map(({ candidate }) => candidate));
		return { status: "none", outcome: "below-resolution", detail };
	}

	const meetsHdr = rules.hdrOnly
		? meetsResolution.filter(({ candidate }) => candidate.hdr === "HDR")
		: meetsResolution;
	if (meetsHdr.length === 0) {
		return { status: "none", outcome: "no-hdr", detail: null };
	}

	const meetsVoice = rules.requireRussianVoice
		? meetsHdr.filter(({ parsed }) => parsed.hasRussianVoice)
		: meetsHdr;
	if (meetsVoice.length === 0) {
		return { status: "none", outcome: "no-voice", detail: null };
	}

	const candidate = bestByQuality(meetsVoice.map((entry) => entry.candidate));
	return { status: "found", candidate };
}
