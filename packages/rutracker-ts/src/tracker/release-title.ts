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

const YEAR_PATTERN = /(?:19|20)\d{2}/;
const YEAR_RANGE_EXACT = /^(?:19|20)\d{2}(?:-(?:19|20)\d{2})?$/;
const YEAR_IN_PAREN = /\((?:19|20)\d{2}\)/;
const STANDALONE_YEAR = /(?<![\p{L}\p{N}])(?:19|20)\d{2}(?![\p{L}\p{N}])/u;

// S\d+ (a season/episode marker like "S01" or "S01E05") deliberately has no trailing
// boundary check: the brief wants segments *starting with* S\d+ dropped regardless of
// what follows (e.g. "E05"). The word-style prefixes still require a boundary so a real
// title like "Superman" or "Seasonal Drama" isn't mistaken for a season marker.
const DROP_SEGMENT_PREFIX =
	/^(?:(?:Сезон|Серии|Серия|Season|Episodes|Episode)(?![\p{L}\p{N}])|S\d+)/u;

const CAMRIP_TOKENS =
	"CAMRip|CamRip|HDCAM|HDTS|HDTC|TeleSync|TeleCine|CAM|TS|TC";
const CAMRIP_REGEX = new RegExp(
	`(?<![\\p{L}\\p{N}])(?:${CAMRIP_TOKENS})(?![\\p{L}\\p{N}])`,
	"u",
);
const SCREENER_REGEX = /экранк/iu;

const VOICE_TOKENS = "Дубляж|Многоголос\\p{L}*|Dub|MVO|ДБ|ПМ";
const VOICE_REGEX = new RegExp(
	`(?<![\\p{L}\\p{N}])(?:${VOICE_TOKENS})(?![\\p{L}\\p{N}])`,
	"u",
);
const RUTOR_VOICE_SUFFIX = /\|\s*[DP]\b/;

function findYear(title: string): YearResult {
	const bracketOpen = title.indexOf("[");

	if (bracketOpen !== -1) {
		const bracketMatch = /\[([^\]]*)\]/.exec(title);
		const bracketContent = bracketMatch?.[1] ?? "";
		const yearMatch = YEAR_PATTERN.exec(bracketContent);
		if (yearMatch) {
			return {
				year: Number(yearMatch[0]),
				source: "bracket",
				index: bracketOpen,
			};
		}
	}

	const beforeBracket =
		bracketOpen === -1 ? title : title.slice(0, bracketOpen);
	const parenMatch = YEAR_IN_PAREN.exec(beforeBracket);
	if (parenMatch) {
		const yearDigits = YEAR_PATTERN.exec(parenMatch[0]);
		if (yearDigits) {
			return {
				year: Number(yearDigits[0]),
				source: "paren",
				index: parenMatch.index,
			};
		}
	}

	for (const segment of title.split(" / ")) {
		const trimmed = segment.trim();
		if (YEAR_RANGE_EXACT.test(trimmed)) {
			return {
				year: Number(trimmed.slice(0, 4)),
				source: "segment",
				index: -1,
			};
		}
	}

	const standaloneMatch = STANDALONE_YEAR.exec(title);
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

	for (const rawSegment of withoutParens.split(" / ")) {
		const trimmed = rawSegment.trim();
		if (trimmed === "") continue;
		if (YEAR_RANGE_EXACT.test(trimmed)) break;
		if (DROP_SEGMENT_PREFIX.test(trimmed)) continue;
		names.push(trimmed);
	}

	if (names.length === 0) {
		const fallback = withoutParens.trim();
		if (fallback !== "") names.push(fallback);
	}

	return names;
}

function findNameHead(title: string, yearResult: YearResult): string {
	if (yearResult.source === "fallback") {
		return title.slice(0, yearResult.index).replace(/[._]/g, " ");
	}

	const boundaries: number[] = [];
	const bracketOpen = title.indexOf("[");
	if (bracketOpen !== -1) boundaries.push(bracketOpen);
	if (yearResult.source === "paren" && yearResult.index !== -1)
		boundaries.push(yearResult.index);
	const pipeIndex = title.indexOf("|");
	if (pipeIndex !== -1) boundaries.push(pipeIndex);

	const end = boundaries.length > 0 ? Math.min(...boundaries) : title.length;
	return title.slice(0, end);
}

export function parseReleaseTitle(title: string): ParsedReleaseTitle {
	const yearResult = findYear(title);
	const nameHead = findNameHead(title, yearResult);
	const names = extractNames(nameHead);

	const isCamrip = CAMRIP_REGEX.test(title) || SCREENER_REGEX.test(title);
	const hasRussianVoice =
		VOICE_REGEX.test(title) || RUTOR_VOICE_SUFFIX.test(title);

	return { names, year: yearResult.year, isCamrip, hasRussianVoice };
}
