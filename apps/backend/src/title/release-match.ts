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

/**
 * Whether a parsed tracker release belongs to a Title: one release name must
 * equal one target name after normalization, and the release year must fit
 * the target's year. No fuzzy matching or similarity scoring.
 */
export function releaseMatchesTitle(
	release: Pick<ParsedReleaseTitle, "names" | "year">,
	target: MatchTarget,
): boolean {
	if (release.year === null) return false;

	const releaseNames = new Set(release.names.map(normalizeTitleName));
	const nameMatches = target.names.some((name) =>
		releaseNames.has(normalizeTitleName(name)),
	);
	if (!nameMatches) return false;

	if (target.year === null) return true;

	if (target.kind === "films") {
		return Math.abs(release.year - target.year) <= 1;
	}

	return release.year >= target.year - 1;
}
