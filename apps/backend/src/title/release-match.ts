import type { ParsedReleaseTitle } from "@brotracker/rutracker-ts/tracker/release-title";
import type { TitleKind } from "./title.types";

const NON_ALNUM_RUN = /[^\p{L}\p{N}]+/gu;

/**
 * Lowercases, folds `ё`→`е`, collapses any run of non letter/digit characters
 * into a single space, and trims. Used to compare a tracker release name
 * against a Title's known names without caring about punctuation or case.
 */
export function normalizeTitleName(name: string): string {
	return name
		.toLowerCase()
		.replace(/ё/g, "е")
		.replace(NON_ALNUM_RUN, " ")
		.trim();
}

export type MatchTarget = {
	kind: TitleKind;
	year: number | null;
	names: string[];
};

/** Whether one release name equals one target name after normalization. */
export function releaseNamesMatch(
	release: Pick<ParsedReleaseTitle, "names">,
	names: string[],
): boolean {
	const releaseNames = new Set(release.names.map(normalizeTitleName));
	return names.some((name) => releaseNames.has(normalizeTitleName(name)));
}

/**
 * Whether a parsed tracker release belongs to a Title: one release name must
 * equal one target name after normalization, and the release year must fit
 * the target's year. No fuzzy matching or similarity scoring.
 *
 * Lenient on purpose (title page `matches` flag): an unknown target year
 * matches any year and series have no upper bound. The «Жду» auto-download
 * path uses the strict rules in `release-pick.ts` instead.
 */
export function releaseMatchesTitle(
	release: Pick<ParsedReleaseTitle, "names" | "year">,
	target: MatchTarget,
): boolean {
	if (release.year === null) return false;
	if (!releaseNamesMatch(release, target.names)) return false;

	if (target.year === null) return true;

	if (target.kind === "films") {
		return Math.abs(release.year - target.year) <= 1;
	}

	// Series: release year >= first-air year - 1, no upper bound, because a season release carries that season's year.
	return release.year >= target.year - 1;
}
