export type ParsedReleaseTitle = {
	/** Display names in title order, trimmed. */
	names: string[];
	year: number | null;
	/** Camera/screener rip (CAMRip, TS, экранка, ...). */
	isCamrip: boolean;
	/** Has a Russian dub/voice-over track (Dub, MVO, ДБ, ПМ, ...). */
	hasRussianVoice: boolean;
};

type YearSource = "bracket" | "paren" | "segment" | "fallback" | null;

type YearResult = {
	year: number | null;
	source: YearSource;
	/** Start index of the match that produced the year, used to bound the name head. */
	index: number;
};

const YEAR_RANGE_EXACT = /^(?:19|20)\d{2}(?:-(?:19|20)\d{2})?$/;
const YEAR_IN_PAREN = /\((?:19|20)\d{2}\)/;
const STANDALONE_YEAR = /(?<![\p{L}\p{N}])(?:19|20)\d{2}(?![\p{L}\p{N}])/u;
const STANDALONE_YEAR_GLOBAL = new RegExp(STANDALONE_YEAR.source, "gu");
const BRACKET_GROUP = /\[([^\]]*)\]/g;
const SEGMENT_SEPARATOR = " / ";

// S\d+ (a season/episode marker like "S01" or "S01E05") deliberately has no trailing
// boundary check: the brief wants segments *starting with* S\d+ dropped regardless of
// what follows (e.g. "E05"). The word-style prefixes still require a boundary so a real
// title like "Superman" or "Seasonal Drama" isn't mistaken for a season marker.
const DROP_SEGMENT_PREFIX =
	/^(?:(?:Сезон|Серии|Серия|Season|Episodes|Episode)(?![\p{L}\p{N}])|S\d+)/u;

function tokenRegex(tokens: string, flags: string): RegExp {
	return new RegExp(
		`(?<![\\p{L}\\p{N}])(?:${tokens})(?![\\p{L}\\p{N}])`,
		flags,
	);
}

// Long camrip spellings are unambiguous, so any case (CAMRIP, Camrip, HDCAMRip, TeleSynch).
const CAMRIP_LONG_REGEX = tokenRegex(
	"(?:hd-?)?cam-?rip|hd-?cam|(?:hd-?)?ts-?rip|hd-?ts|(?:hd-?)?tc-?rip|hd-?tc|tele-?synch?|tele-?cine",
	"iu",
);
// Short tokens only in upper case: "ts"/"tc"/"cam" in lower case are too ambiguous.
const CAMRIP_SHORT_REGEX = tokenRegex("CAM|TS|TC", "u");
const SCREENER_REGEX = /экранк/iu;

// Russian words for dubbing / multi-voice, any case ("многоголосый", "Дублированный").
const VOICE_WORD_TOKENS = "дубляж|дублирован\\p{L}*|многоголос\\p{L}*";
// Short tracker abbreviations, case-sensitive.
const VOICE_ABBR_TOKENS = "Dub|MVO|ДБ|ПМ";
const VOICE_WORD_REGEX = tokenRegex(VOICE_WORD_TOKENS, "giu");
const VOICE_ABBR_REGEX = tokenRegex(VOICE_ABBR_TOKENS, "gu");
// A voice token followed by a non-Russian language marker ("Dub (Ukr)", "MVO Eng") is
// another language's track.
const NON_RUSSIAN_LANGUAGE_AFTER =
	/^\s*\(?\s*(?:ukr|eng|kaz|bel|ger|deu|fre|fra|spa|ita|jap|jpn|kor|chi|pol|por|tur|укр\p{L}*|англ\p{L}*|каз|бел)(?![\p{L}\p{N}])/iu;
// RuTor suffix: "| D" dubbing, "| P" / "| P1" / "| P2" professional voice-over, "| Лицензия".
const RUTOR_VOICE_SUFFIX = /\|\s*(?:D|P\d?|Лицензия)(?![\p{L}\p{N}])/u;

function lastStandaloneYear(text: string): RegExpExecArray | null {
	let last: RegExpExecArray | null = null;
	for (const match of text.matchAll(STANDALONE_YEAR_GLOBAL)) {
		last = match as RegExpExecArray;
	}
	return last;
}

/**
 * Kinozal-style "Name / Name / 2019 / ДБ / BDRip": picks the exact-year segment that
 * has more segments after it (the last such), so a numeric name like "1917" or "2012"
 * in front is not taken for the year. Returns the segment's start offset.
 */
function findYearSegment(title: string): YearResult | null {
	const segments = title.split(SEGMENT_SEPARATOR);
	const candidates: Array<{ position: number; offset: number; value: string }> =
		[];
	let offset = 0;
	segments.forEach((segment, position) => {
		const trimmed = segment.trim();
		if (YEAR_RANGE_EXACT.test(trimmed)) {
			candidates.push({ position, offset, value: trimmed });
		}
		offset += segment.length + SEGMENT_SEPARATOR.length;
	});

	const lastPosition = segments.length - 1;
	const chosen =
		candidates
			.filter((c) => c.position > 0 && c.position < lastPosition)
			.at(-1) ??
		candidates.filter((c) => c.position > 0).at(-1) ??
		candidates.at(-1);
	if (!chosen) return null;

	return {
		year: Number(chosen.value.slice(0, 4)),
		source: "segment",
		index: chosen.offset,
	};
}

function findYear(title: string): YearResult {
	const bracketOpen = title.indexOf("[");

	// The first [...] group that holds a year ("[2026, США, ...]"); a leading
	// "[Сезон 1]" or "[01-08 из 08]" is skipped.
	for (const group of title.matchAll(BRACKET_GROUP)) {
		const yearMatch = STANDALONE_YEAR.exec(group[1] ?? "");
		if (yearMatch) {
			return {
				year: Number(yearMatch[0]),
				source: "bracket",
				index: bracketOpen,
			};
		}
	}

	const parenMatch = YEAR_IN_PAREN.exec(title);
	if (parenMatch) {
		return {
			year: Number(parenMatch[0].slice(1, 5)),
			source: "paren",
			index: parenMatch.index,
		};
	}

	const segmentResult = findYearSegment(title);
	if (segmentResult) return segmentResult;

	// Scene names ("Blade.Runner.2049.2017.1080p"): the release year comes last.
	const standaloneMatch = lastStandaloneYear(title);
	if (standaloneMatch) {
		return {
			year: Number(standaloneMatch[0]),
			source: "fallback",
			index: standaloneMatch.index,
		};
	}

	return { year: null, source: null, index: -1 };
}

function extractNames(nameHead: string): string[] {
	const withoutParens = nameHead.replace(/\([^()]*\)/g, "");
	const names: string[] = [];

	// The name head already ends before the year, so a year-looking segment here
	// is a numeric name ("1917", "2012"), not the year.
	for (const rawSegment of withoutParens.split(SEGMENT_SEPARATOR)) {
		const trimmed = rawSegment.trim();
		if (trimmed === "") continue;
		if (DROP_SEGMENT_PREFIX.test(trimmed)) continue;
		names.push(trimmed);
	}

	if (names.length === 0) {
		const fallback = withoutParens.trim();
		if (fallback !== "") names.push(fallback);
	}

	return names;
}

/** End of the name head: the first `[`, `|`, or the start of the year match. */
function findNameHeadEnd(title: string, yearResult: YearResult): number {
	const boundaries: number[] = [];
	const bracketOpen = title.indexOf("[");
	if (bracketOpen !== -1) boundaries.push(bracketOpen);
	const pipeIndex = title.indexOf("|");
	if (pipeIndex !== -1) boundaries.push(pipeIndex);
	if (yearResult.source !== "bracket" && yearResult.index !== -1)
		boundaries.push(yearResult.index);

	return boundaries.length > 0 ? Math.min(...boundaries) : title.length;
}

export function parseReleaseTitle(title: string): ParsedReleaseTitle {
	const yearResult = findYear(title);
	const nameHeadEnd = findNameHeadEnd(title, yearResult);
	const rawNameHead = title.slice(0, nameHeadEnd);
	// Scene names use dots/underscores for spaces; real titles keep their dots.
	const nameHead = /\s/.test(title)
		? rawNameHead
		: rawNameHead.replace(/[._]/g, " ");
	const names = extractNames(nameHead);

	// Flags come from the release details, not the name ("TS-17" is a title). When
	// nothing bounds the name, the whole title is all there is to scan.
	const details = nameHeadEnd < title.length ? title.slice(nameHeadEnd) : title;
	const isCamrip =
		CAMRIP_LONG_REGEX.test(details) ||
		CAMRIP_SHORT_REGEX.test(details) ||
		SCREENER_REGEX.test(details);
	const hasRussianVoice =
		hasRussianVoiceToken(details) || RUTOR_VOICE_SUFFIX.test(details);

	return { names, year: yearResult.year, isCamrip, hasRussianVoice };
}

function hasRussianVoiceToken(text: string): boolean {
	for (const regex of [VOICE_WORD_REGEX, VOICE_ABBR_REGEX]) {
		for (const match of text.matchAll(regex)) {
			const after = text.slice(match.index + match[0].length);
			if (!NON_RUSSIAN_LANGUAGE_AFTER.test(after)) return true;
		}
	}
	return false;
}
